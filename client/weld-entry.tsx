import { Fragment, useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { AlertCircle, ChevronDown, ChevronRight, FileText, Loader2, Lock, Paperclip, Pencil, Plus, RotateCcw, Stamp, Trash2 } from 'lucide-react';
import { useWorkspace, activeRows } from './context.tsx';
import { Badge, Dropdown, EmptyState, Modal, TableScroll, revealInvalidField } from './components.tsx';
import { availableWps } from './catalog.ts';
import { ApiError, api, apiUrl, post, formatDate } from './api.ts';
import { InspectionCell } from './weld-inspection-cell.tsx';
import { AttachmentCountBadge } from './iso-dialogs.tsx';
import { uploadFiles, useInspectionMenu, type InspectionMenuItem } from './inspections.tsx';
import { PunchDialog } from './punch.tsx';
import { projectCertificates, wpsValidation } from '../shared/site-settings.ts';
import { enabledOnSite, enabledOptions } from '../shared/weld-catalogs.ts';
import { SPOOL_NAMES, SPOOL_NAME_INPUT, spoolOptionsForIso } from '../shared/spool-catalog.ts';
import { resourceAvailable } from '../shared/release.ts';
import { HEAT_TYPES, NDT_DOCUMENT, NDT_ROUNDS, NDT_TYPES, INSPECTION_MASS_EDIT_FIELDS, INSPECTION_WELD_FIELDS, currentRequest, inspectionFileError, ndtOrPwhtInProgress, requestFlag, roundLabel, weldResults } from '../shared/inspections.ts';
import { isAdministrator } from '../shared/permissions.ts';
import { menuGroups } from '../shared/iso-pages.ts';
import { nonWeldCode } from '../shared/weld-codes.ts';
import {
  WELDERS, diameterOptionValue, diameterOptions, certificateErrors, certificatesForProject, chargeSelection, chargeValue, lockContext, locationTooltip, missingMandatoryFields, neighbourOf, orderedWelds,
  planWeldRange, sideSummary, typeAbbreviation, weldDiameterText, weldLocation, weldLock, WELD_ENTRY_FIELDS, SIDE_VALUES,
  MASS_EDIT_CLEAR_LABEL, MASS_EDIT_COLUMNS, MASS_EDIT_DATES, MASS_EDIT_DATE_HINT, MASS_EDIT_DIAMETER, MASS_EDIT_FLAGS_LABELS, MASS_EDIT_SECTIONS, MASS_EDIT_SELECT_NOTHING,
  NO_WELDER_TEXT, STAMP_NONE, WELD_BRING_BACK_WORDING, deletedViewEmpty, stayInDeletedView, WELD_DELETE_WORDING, WELD_OPTIONS_MENU, sideCellTexts, stampOptionLabel,
  MASS_EDIT_MANDATORY_MESSAGE, massEditMissingFields, readMassEdit, weldSortingDisabled, welderStamps, type MassEditItem,
  CERTIFICATE_NOT_SELECTABLE, DIAMETER_MESSAGES, DUPLICATE_WELDER, EDIT_REASON_LABEL, EDIT_REASON_MAX, EDIT_REASON_WARNING, EDIT_TRACER_HINT, WELD_MANDATORY_MESSAGE, addNewEnabled, certificateSelectable, certificateSelectionErrors, chargeDetails,
  chargeOptionList, diameterErrors, diameterTextOrder, duplicateWelderErrors, editHistoryDate, editReason, newWeldDefaults, specialWeldCleared, specialWeldHidden, weldDiameterCheck, weldFormLayout, wireLabel, wpsLabel,
  RANGE_DIALOG, WELDER_PLACEHOLDER, chargeMaterialGroup, chargesForWelders, diameterRowSize, diameterSizeMm, groupWeldersForDia, materialGroupWarnings, suggestOnDia, welderFieldsDisabled, welderOptionList, weldersForWps, weldersQualifiedForDiameter,
  diameterSizeInch, wpsChangeClearsWelders, wpsDiameterErrors, wpsMatchesDiameter, wpsOfferedForDiameters, weldDiameterOf, rangeSkippedMessage, type SelectOption,
  NDT_ATTACH_RESULTS, NDT_LOCK_COMMENT_LABEL, NDT_LOCK_COMMENT_REQUIRED, NDT_LOCK_REASON, ndtAttachLabel, ndtLock, ndtLockRefusal,
} from '../shared/weld-entry.ts';
import type { Row } from '../shared/types.ts';

type Values = Record<string, unknown>;
const str = (value: unknown) => String(value ?? '');
const FLAGS = ['ndoReqPre', 'ndoReq', 'pwhtReqPre', 'pwhtReq', 'repair'] as const;
const sortByName = (rows: Row[], key = 'name') => [...rows].sort((a, b) => str(a[key]).localeCompare(str(b[key]), 'en', { numeric: true }));

/** Everything the table, the form and the dialogs read for one isometric, derived once from the workspace rows. */
/** Dia. options: one per distinct Size in inches of the catalog in the hosted profile (see diameterOptions). */
function useDiameterOptions(textOrder = false, keep?: unknown) {
  const { rows, user, siteId } = useWorkspace();
  return useMemo(() => {
    const hosted = Boolean(user.availability?.features.includes('pilots')), all = activeRows(rows, 'diameters');
    // A main project with its own diameter list (a new one: its standard's chart sizes plus what was added there) offers those records, each labelled with its text (`2"`, `DN 50`), in the chart's order; the value a weld already holds stays listed. Older main projects keep the grouped list.
    if (hosted && siteId && (rows.catalog_sites || []).some(link => link.resourceKey === 'diameters' && link.siteId === siteId)) return diameterOptions(enabledOptions('diameters', all, siteId, rows, keep), false, true);
    const options = diameterOptions(all, hosted);
    return textOrder ? diameterTextOrder(options) : options;
  }, [rows, user, siteId, textOrder, keep]);
}
function useWeldData(iso: Row) {
  const { rows, allRows, welderStamps } = useWorkspace();
  return useMemo(() => {
    const all = (rows.welds || []).filter(weld => weld.isoId === iso.id);
    const welds = orderedWelds(all.filter(weld => !weld._archived), weldSortingDisabled(iso));
    const project = rows.projects?.find(row => row.id === iso.projectId);
    const site = rows.sites?.find(row => row.id === project?.siteId) ?? allRows.sites?.find(row => row.id === project?.siteId);
    const byId = (key: string) => new Map((rows[key] || []).map(row => [row.id, row]));
    const certificates = rows.certifications || [];
    const offered = project && projectCertificates(site) ? certificatesForProject(certificates, project.id, { links: rows.certificate_projects || [] }) : activeRows(rows, 'certifications');
    const lookups = { diameters: byId('diameters'), materialTypes: byId('material_types'), materialParts: byId('material_parts'), materials: byId('materials') };
    return {
      all, welds, deleted: orderedWelds(all.filter(weld => weld._archived), true), project, site, certificates, offered, lookups, requests: rows.inspection_requests || [],
      lock: lockContext(rows.weld_types, rows.releases, rows.isometrics),
      types: byId('weld_types'), stampers: byId('qa_engineers'), welders: new Map([...(welderStamps || []).map(stamp => [stamp.id, stamp as unknown as Row] as const), ...byId('welders')]), wps: byId('wps'), diameters: byId('diameters'), spools: byId('spools'), certs: byId('certifications'), materials: byId('materials'), materialTypes: byId('material_types'), materialParts: byId('material_parts'),
    };
  }, [rows, allRows, iso, welderStamps]);
}
type WeldData = ReturnType<typeof useWeldData>;

// --------------------------------------------------------------------------------------------------- small controls

function Labelled({ label, error, hint, children, className = '', htmlFor, extra }: { label: string; error?: string; hint?: string; children: ReactNode; className?: string; htmlFor: string; extra?: string }) {
  return <div className={`field ${className}`}><label htmlFor={htmlFor}>{label}{extra && <span className="sr-only"> ({extra})</span>}</label>{children}{hint && <small className="field-hint">{hint}</small>}{error && <small id={`${htmlFor}-error`} className="field-error">{error}</small>}</div>;
}
function TextField({ label, value, onChange, error, type = 'text', required, readOnly, hint, min, max, invalid }: { label: string; value: unknown; onChange?: (value: string) => void; error?: string; type?: 'text' | 'date' | 'number'; required?: boolean; readOnly?: boolean; hint?: string; min?: number; max?: number; invalid?: boolean }) {
  const id = `weld-${useId().replaceAll(':', '')}`;
  return <Labelled label={required ? `${label} *` : label} error={error} hint={hint} htmlFor={id}><input id={id} type={type} value={str(value)} required={required} readOnly={readOnly} min={min} max={max} step={type === 'number' ? 'any' : undefined} aria-invalid={Boolean(error) || invalid} aria-describedby={error ? `${id}-error` : undefined} autoComplete="off" onChange={event => onChange?.(event.target.value)}/></Labelled>;
}
function SelectField({ label, value, onChange, error, options, placeholder = 'Select', disabled, hint, className, extra, invalid, groups, placeholderDisabled }: { label: string; value: unknown; onChange: (value: string) => void; error?: string; options: { value: string; label: string; disabled?: boolean }[]; placeholder?: string; disabled?: boolean; hint?: string; className?: string; extra?: string; invalid?: boolean; groups?: { label: string; options: { value: string; label: string; disabled?: boolean }[] }[]; placeholderDisabled?: boolean }) {
  const id = `weld-${useId().replaceAll(':', '')}`;
  return <Labelled label={label} error={error} hint={hint} htmlFor={id} className={className} extra={extra}><div className="select-wrap"><select id={id} value={str(value)} disabled={disabled} aria-invalid={Boolean(error) || invalid} aria-describedby={error ? `${id}-error` : undefined} onChange={event => onChange(event.target.value)}><option value="" disabled={placeholderDisabled}>{placeholder}</option>{groups ? groups.map(group => <optgroup key={group.label} label={group.label}>{group.options.map(option => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}</optgroup>) : options.map(option => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}</select><ChevronDown size={14}/></div></Labelled>;
}
function CheckField({ label, checked, onChange, disabled, hint, error }: { label: string; checked: boolean; onChange?: (checked: boolean) => void; disabled?: boolean; hint?: string; error?: string }) {
  const id = `weld-${useId().replaceAll(':', '')}`;
  return <div className="field checkbox-field"><label htmlFor={id}><input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={event => onChange?.(event.target.checked)}/><span>{label}</span></label>{hint && <small className="field-hint">{hint}</small>}{error && <small className="field-error">{error}</small>}</div>;
}
/** The error banner. A long form may be scrolled to its end, so a new message focuses the first invalid field, else scrolls the banner into view. */
function Failure({ message }: { message: string }) {
  const banner = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!message || !banner.current) return;
    const invalid = banner.current.closest('form')?.querySelector<HTMLElement>('[aria-invalid="true"]');
    if (invalid) invalid.focus(); else banner.current.scrollIntoView({ block: 'nearest' });
  }, [message]);
  return message ? <div ref={banner} className="alert error" role="alert"><AlertCircle size={18}/><span>{message}</span></div> : null;
}

/**
 * The options a charge number offers. Add weld and Mass edit: the project's certificates, then CONN ISO, EXISTING and the
 * 13 part placeholders; Edit weld: the fixed values first. Certificates that are not Controlled + Accepted are disabled.
 */
function chargeOptions(data: WeldData, selected: string, mode: 'add' | 'edit' = 'add', diameterSize = '', offered: Row[] = data.offered) {
  const list = [...offered];
  const current = data.certs.get(selected); if (current && !list.some(row => row.id === current.id)) list.push(current);
  return chargeOptionList(list, mode, data.lookups, diameterSize).map(option => option.value === selected ? { ...option, disabled: false } : option);
}
/** Material warning box (reference weld-material-group-check): yellow, above the footer, never blocks saving. */
function MaterialWarnings({ warnings }: { warnings: string[] }) {
  if (!warnings.length) return null;
  return <div className="alert weld-warning" role="status">{warnings.map(warning => <div key={warning}><AlertCircle size={18}/><span><strong>Warning</strong><br/>{warning}</span></div>)}</div>;
}
/** The warnings of two chosen certificates against a WPS, read from their types of material. */
function groupWarnings(data: WeldData, certificate1: Row | undefined, certificate2: Row | undefined, wps: Row | undefined) {
  if (!certificate1 || !certificate2 || !wps) return [];
  return materialGroupWarnings(chargeMaterialGroup(certificate1, data.materialTypes), chargeMaterialGroup(certificate2, data.materialTypes), wps, str(wps.name));
}
/**
 * The Spool select of the hosted form (shared/spool-catalog.ts): catalog names enabled on the main project minus names used on
 * another isometric of the project, then this isometric's own spools; the weld's current spool stays listed. null elsewhere.
 */
function useSpoolOptions(iso: Row, data: WeldData, keep: string) {
  const { rows, user } = useWorkspace();
  return useMemo(() => {
    if (!user.availability?.features.includes('pilots') || !resourceAvailable(user.availability, SPOOL_NAMES)) return null;
    const isoIds = new Set((rows.isometrics || []).filter(row => !row._archived && row.projectId === iso.projectId).map(row => row.id)); isoIds.add(iso.id);
    const siteId = str(data.site?.id);
    const options = spoolOptionsForIso(activeRows(rows, SPOOL_NAMES), row => enabledOnSite(SPOOL_NAMES, row, siteId, rows), (rows.spools || []).filter(row => isoIds.has(str(row.isoId))), iso.id).map(option => option.name);
    return keep && !options.includes(keep) ? [...options, keep] : options;
  }, [rows, user, iso, data.site, keep]);
}

// --------------------------------------------------------------------------------------------------- add / edit weld

const todayText = () => { const now = new Date(), two = (value: number) => String(value).padStart(2, '0'); return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`; };
const ENTRY_FLAGS: Values = Object.fromEntries(FLAGS.map(name => [name, false]));
function initialValues(weld: Row | undefined, isoId: string): Values {
  const values: Values = { lengthMode: 'Diameter', ...ENTRY_FLAGS, tracer: Boolean(weld?.tracer) };
  if (weld) for (const name of WELD_ENTRY_FIELDS) values[name] = (FLAGS as readonly string[]).includes(name) ? Boolean(weld[name]) : weld[name] || (name === 'lengthMode' ? 'Diameter' : weld[name] ?? '');
  else Object.assign(values, newWeldDefaults(todayText()));
  return { ...values, isoId };
}
const normalised = (name: string, value: unknown) => (FLAGS as readonly string[]).includes(name) ? Boolean(value) : value === undefined || value === null ? '' : value;
/** Edit sends the changed fields only; a new weld sends everything that has a value. */
function weldPayload(values: Values, weld?: Row): Values {
  const payload: Values = {};
  for (const name of WELD_ENTRY_FIELDS) {
    const value = values[name];
    if (weld ? normalised(name, value) !== normalised(name, weld[name]) : value !== '' && value !== undefined && value !== null) payload[name] = value;
  }
  return payload;
}
const errorMessage = (error: unknown) => (error as Error).message || 'The weld could not be saved.';
const sizeText = (size: string) => `${size}"`;

/** Previous edits at the top of Edit weld: collapsed, with the reasons entered for earlier edits (Date | Comment | User). */
function PreviousEdits({ weldId }: { weldId: string }) {
  const [edits, setEdits] = useState<{ date: string; comment: string; user: string }[] | null>(null), [failed, setFailed] = useState(false), [open, setOpen] = useState(false);
  const panel = `weld-previous-edits-${useId().replaceAll(':', '')}`;
  useEffect(() => {
    let live = true;
    api<{ edits: { date: string; comment: string; user: string }[] }>(`/weld-history/${encodeURIComponent(weldId)}`).then(result => { if (live) setEdits(result.edits || []); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [weldId]);
  if (failed) return <p className="muted weld-history-note">Previous edits could not be loaded.</p>;
  if (!edits) return <p className="muted weld-history-note" role="status"><Loader2 size={13} className="spin"/>Loading previous edits…</p>;
  if (!edits.length) return null;
  return <div className="weld-history">
    <button type="button" className="weld-history-toggle" aria-expanded={open} aria-controls={panel} onClick={() => setOpen(current => !current)}>{open ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}Previous edits<span className="weld-history-count">{edits.length}</span></button>
    <div id={panel} className="weld-history-panel" hidden={!open}><TableScroll><table className="data-table"><thead><tr><th scope="col">Date</th><th scope="col">Comment</th><th scope="col">User</th></tr></thead><tbody>{edits.map((edit, index) => <tr key={`${edit.date}-${index}`}><td className="tabular">{editHistoryDate(edit.date)}</td><td>{edit.comment}</td><td>{edit.user}</td></tr>)}</tbody></table></TableScroll></div>
  </div>;
}

/**
 * "NDT result" of Edit weld (client request 20.11.2026: results are attached to the weld the NDT was meant for, not
 * entered on a separate page). Lists the weld's NDT / NDT Pre results with their report files, and "Attach NDT result":
 * the weld's NDT request, the round, report number, date, the PDF and a required Approved / Rejected. It saves through
 * the existing "Upload NDT" action (server/inspections.ts `inspection-upload`), so the request settles and the tracer
 * and repair rules read the result as before; Approved / Rejected are stored as Accepted / Rejected. A weld locked by its
 * NDT request still takes results; a weld of a completed phase does not (the server refuses it as well).
 */
function NdtResultSection({ weld, phaseLocked }: { weld: Row; phaseLocked: boolean }) {
  const { rows, canRun, canRecord, hasFeature, refresh, notify } = useWorkspace();
  const [open, setOpen] = useState(false), [type, setType] = useState(''), [round, setRound] = useState(''), [reportNo, setReportNo] = useState(''), [date, setDate] = useState(todayText()), [result, setResult] = useState(''), [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  if (!hasFeature('inspections') || !canRecord('inspection_results')) return null;
  const typeLabel = (stored: string) => stored === 'NDT PRE' ? 'NDT Pre' : 'NDT';
  // One choice per examination: the weld's current request of that type, else a new request when the weld requires it.
  const choices = NDT_TYPES.map(kind => ({ type: kind, request: currentRequest(rows.inspection_requests, weld.id, kind) })).filter(choice => (choice.request || weld[requestFlag(choice.type)] === true) && canRun('inspection-upload', { type: choice.type }));
  const results = weldResults(rows.inspection_results, weld.id, NDT_TYPES);
  const allResults = (rows.inspection_results || []).filter(row => !row._archived);
  // The report file is stored on one result of the report (Upload NDT on multiple welds): every result of that report shows it.
  const filesOf = (row: Row) => {
    const sameReport = new Set(allResults.filter(item => item.type === row.type && str(item.reportNo) !== '' && str(item.reportNo) === str(row.reportNo)).map(item => item.id)); sameReport.add(row.id);
    return (rows.attachments || []).filter(item => !item._archived && item.entityType === 'inspection_results' && sameReport.has(str(item.entityId)));
  };
  const chosen = choices.find(choice => choice.type === type) ?? choices[0];
  const roundsDone = new Set(allResults.filter(row => chosen?.request && row.requestId === chosen.request.id && str(row.result) !== '').map(row => str(row.round)));
  const roundValue = round || (NDT_ROUNDS.find(item => !roundsDone.has(item.key)) ?? NDT_ROUNDS[0]).key;
  const canAttach = !phaseLocked && choices.length > 0;
  function start() { setOpen(true); setError(''); setType(choices[0]?.type ?? ''); setRound(''); setReportNo(''); setDate(todayText()); setResult(''); setFile(null); }
  async function save() {
    setError('');
    if (!chosen) { setError('This weld has no NDT request to attach a result to.'); return; }
    if (!reportNo.trim()) { setError('Enter the report number.'); return; }
    if (!date) { setError('Enter the NDT date.'); return; }
    if (!result) { setError('Choose Approved or Rejected.'); return; }
    if (!file) { setError('Choose the NDT report (PDF).'); return; }
    const wrong = inspectionFileError(NDT_DOCUMENT, file.name); if (wrong) { setError(wrong); return; }
    setBusy(true);
    try {
      const saved = await post<{ records: Row[] }>('/actions/inspection-upload', { type: chosen.type, weldIds: [weld.id], rounds: [{ round: roundValue, reportNo: reportNo.trim(), result }], date });
      const record = saved.records.find(row => row.weldId === weld.id) ?? saved.records[0];
      const failed = record ? await uploadFiles('inspection_results', record.id, [file], NDT_DOCUMENT) : 1;
      await refresh();
      notify(failed ? `NDT result saved on weld ${str(weld.weldNo)}; the report file could not be uploaded.` : `NDT result ${ndtAttachLabel(result)} attached to weld ${str(weld.weldNo)}.`);
      setOpen(false);
    } catch (failure) { setError(errorMessage(failure)); } finally { setBusy(false); }
  }
  return <section className="weld-ndt" aria-label="NDT result" onKeyDown={event => { if (event.key === 'Enter' && (event.target as HTMLElement).tagName === 'INPUT') event.preventDefault(); }}>
    <div className="weld-ndt-heading"><h3 className="weld-form-section">NDT result</h3>{canAttach && !open && <button type="button" className="btn small" onClick={start}><Paperclip size={15}/>Attach NDT result</button>}</div>
    {results.length ? <TableScroll><table className="data-table weld-ndt-table" aria-label={`NDT results of weld ${str(weld.weldNo)}`}><thead><tr><th scope="col">Report number</th><th scope="col">Examination</th><th scope="col">Round</th><th scope="col">Date</th><th scope="col">Result</th><th scope="col">Report</th></tr></thead>
      <tbody>{results.map(row => { const files = filesOf(row); return <tr key={row.id}><td>{str(row.reportNo) || '—'}</td><td>{typeLabel(str(row.type))}</td><td>{roundLabel(row.round)}</td><td className="tabular">{formatDate(row.date)}</td><td><Badge color={row.result === 'Accepted' ? 'green' : row.result === 'Rejected' ? 'red' : 'neutral'}>{ndtAttachLabel(row.result)}</Badge></td>
        <td>{files.length ? files.map(item => <a key={item.id} className="weld-ndt-file" target="_blank" rel="noopener noreferrer" href={apiUrl(`/files/${item.id}`)}><FileText size={14}/>{str(item.name)}</a>) : <span className="muted">No file</span>}</td></tr>; })}</tbody></table></TableScroll>
      : <p className="muted weld-ndt-empty">{canAttach || phaseLocked ? 'No NDT result attached yet.' : 'No NDT result attached yet. A result can be attached once the weld requires NDT or has an NDT request.'}</p>}
    {open && <div className="weld-ndt-form">
      <Failure message={error}/>
      <div className="form-grid">
        <SelectField label="NDT request" value={chosen?.type ?? ''} placeholder="Choose" placeholderDisabled options={choices.map(choice => ({ value: choice.type, label: choice.request ? `${str(choice.request.number) || 'Request'} · ${typeLabel(choice.type)} · ${str(choice.request.status)}` : `New ${typeLabel(choice.type)} request` }))} onChange={value => { setType(value); setRound(''); }}/>
        <SelectField label="Round" value={roundValue} placeholder="Choose" placeholderDisabled options={NDT_ROUNDS.map(item => ({ value: item.key, label: `${item.label}${roundsDone.has(item.key) ? ' (has a result)' : ''}` }))} hint={roundsDone.has(roundValue) ? 'This round already has a result on the request; saving replaces it.' : undefined} onChange={setRound}/>
        <TextField label="Report number" required value={reportNo} onChange={setReportNo}/>
        <TextField label="NDT date" type="date" required value={date} onChange={setDate}/>
      </div>
      <fieldset className="weld-ndt-result"><legend>Result *</legend>{NDT_ATTACH_RESULTS.map(choice => <label key={choice.value}><input type="radio" name={`ndt-result-${weld.id}`} value={choice.value} checked={result === choice.value} onChange={() => setResult(choice.value)}/>{choice.label}</label>)}</fieldset>
      <div className="field full-width"><label htmlFor={`weld-ndt-file-${weld.id}`}>NDT report (PDF) *</label><input id={`weld-ndt-file-${weld.id}`} type="file" accept=".pdf,application/pdf" onChange={event => setFile(event.target.files?.[0] ?? null)}/><small className="field-hint">Attached to the result and listed above.</small></div>
      <div className="weld-ndt-actions"><button type="button" className="btn" disabled={busy} onClick={() => setOpen(false)}>Cancel</button><button type="button" className="btn primary" disabled={busy} onClick={() => void save()}>{busy && <Loader2 size={15} className="spin"/>}Save NDT result</button></div>
    </div>}
  </section>;
}

/** Edit weld from the blockers list of the isometric page: read-only with the lock banner while the weld is locked. */
export function EditWeldDialog({ iso, weld, onClose }: { iso: Row; weld: Row; onClose: () => void }) {
  const data = useWeldData(iso), lock = weldLock(weld, data.lock);
  return <WeldDialog iso={iso} weld={weld} data={data} onClose={onClose} lockedReason={lock.locked ? lock.reason : undefined}/>;
}

/**
 * Add weld / Edit weld. `onDeleted` (the LISL passes it when the account may delete welds) adds "Delete weld" at the left of
 * the footer (client change list 22.11.2026, image 17: no trash icon in the rows): shown under the same conditions the row
 * icon had (not locked by a completed phase, not locked by an NDT request for this account); it asks "Are you sure?" first.
 */
export function WeldDialog({ iso, weld, data, onClose, lockedReason, onDeleted }: { iso: Row; weld?: Row; data: WeldData; onClose: () => void; lockedReason?: string; onDeleted?: () => void }) {
  const { rows, refresh, notify, user, canRun } = useWorkspace();
  const [deleting, setDeleting] = useState(false);
  const mode = weld ? 'edit' : 'add';
  // NDT lock (chat 17.11.2026): with an NDT request only an administrator edits the weld, with a change comment; everyone else sees it read-only.
  // An account that only records NDT results opens it read-only as well, for the NDT result section.
  const ndt = ndtLock(data.requests, str(weld?.id), isAdministrator(user));
  const readOnly = Boolean(lockedReason) || (ndt.locked && !ndt.editable) || (Boolean(weld) && !canRun('save-weld', { weldId: str(weld?.id) }));
  const [values, setValues] = useState<Values>(() => initialValues(weld, iso.id));
  const [updatePrev, setUpdatePrev] = useState(false), [updateNext, setUpdateNext] = useState(false);
  const [note, setNote] = useState(''), [defaultDiameter, setDefaultDiameter] = useState('');
  const [error, setError] = useState(''), [fields, setFields] = useState<Record<string, string>>({}), [busy, setBusy] = useState(false);
  const initialSpool = str(data.spools.get(str(weld?.spoolId))?.name), [spoolName, setSpoolName] = useState(initialSpool), spoolNames = useSpoolOptions(iso, data, initialSpool);
  const order = data.welds.map(row => row.id);
  const hasPrev = weld ? Boolean(neighbourOf(order, weld.id, 'prev')) : false, hasNext = weld ? Boolean(neighbourOf(order, weld.id, 'next')) : false;
  const set = (patch: Values) => setValues(current => ({ ...current, ...patch })); const set1 = (name: string) => (value: unknown) => set({ [name]: value });
  const explicit = values.lengthMode === 'Length in mm';
  const diameterRow = data.diameters.get(str(values.diameterId)), diaSize = explicit ? '' : diameterRowSize(diameterRow), diaMm = explicit ? null : diameterSizeMm(diameterRow);
  // "Validation on WPS" on: only WPS whose own diameter range (inches, entered on the WPS) holds the weld's diameter are offered (the chosen one stays).
  const wpsOffered = (row: Row, inch: number | null) => row.id === values.wpsId || (row.active !== false && data.project && availableWps(rows, row, data.project.id) && wpsOfferedForDiameters(data.site, row, [inch]));
  const diaInch = explicit ? null : diameterSizeInch(diameterRow);
  const matchingWps = diaInch === null ? [] : activeRows(rows, 'wps').filter(row => wpsOffered(row, diaInch)).filter(row => wpsMatchesDiameter(row, diaInch)).map(row => row.id);
  // After Dia.: the WPS that match it move to the top.
  const wpsOptions = activeRows(rows, 'wps').filter(row => wpsOffered(row, diaInch)).map(row => ({ value: row.id, label: wpsLabel(row), match: matchingWps.includes(row.id) })).sort((a, b) => Number(b.match) - Number(a.match));
  const selectedCharge = (side: 1 | 2) => data.certs.get(str(values[`certificate${side}Id`]));
  // Catalog records switched off on the active main project are left out, except the value the weld already stores.
  const enabled = (key: string, keep?: unknown) => enabledOptions(key, activeRows(rows, key), str(data.site?.id), rows, keep);
  const options = (key: string, label: (row: Row) => string, filter: (row: Row) => boolean = () => true, keep?: unknown) => sortByName(enabled(key, keep).filter(filter), 'name').map(row => ({ value: row.id, label: label(row) }));
  const nameOf = (row: Row) => str(row.name);
  const wireOf = (row: Row) => wireLabel(row, str(data.lookups.materialTypes.get(str(row.materialTypeId))?.name));
  const diameters = useDiameterOptions(true, values.diameterId);
  const welders = rows.welders || [];
  const welderCertificates = rows.welder_certificates as Row[] | undefined, chosenWps = data.wps.get(str(values.wpsId)), onDate = str(values.date) || todayText();
  // Add weld lists welders only once a WPS is chosen; Edit weld opens with the full list until then.
  const welderFor = (name: string) => mode === 'edit' && !chosenWps ? welders.filter(row => !row._archived && (row.status !== 'Inactive' || row.id === values[name])) : weldersForWps(data.site, welders, welderCertificates, chosenWps, onDate, [values[name]], [diaMm]);
  const qualifiedForDia = useMemo(() => weldersQualifiedForDiameter(welderCertificates, diaMm, onDate), [welderCertificates, diaMm, onDate]);
  const welderGroups = (options: SelectOption[]) => diaMm !== null && qualifiedForDia.size ? groupWeldersForDia(options, qualifiedForDia) : undefined;
  // With "Validation on WPS" on, Charge number 1/2 hold only the certificates usable by the chosen welders and WPS.
  const sizeOfCertificate = (certificate: Row) => diameterSizeMm(data.diameters.get(str(certificate.diameterId)));
  const offeredCharges = wpsValidation(data.site) ? chargesForWelders(data.offered, WELDERS.map(name => str(values[name])), chosenWps, welderCertificates, onDate, sizeOfCertificate) : data.offered;
  const warnings = groupWarnings(data, selectedCharge(1), selectedCharge(2), chosenWps);
  const code = nonWeldCode(values.weldNo), hidden = specialWeldHidden(code, mode);
  const shown = (name: string) => !hidden.has(name);
  // Live rules: missing mandatory fields are marked and block saving; Dia. is compared with the chosen certificates.
  const missing = missingMandatoryFields(data.site, values), blocked = Object.keys(missing).length > 0;
  const diameterCheck = weldDiameterCheck({ ...values, defaultDiameter }, { certificates: data.certs, diameters: data.diameters });
  const reasonNeeded = Boolean(weld) && (ndt.locked || ndtOrPwhtInProgress(data.requests, str(weld?.id)));
  const reasonMissing = reasonNeeded && !editReason(note);
  const addNew = weld ? addNewEnabled(values.weldNo, weld.weldNo, data.all.map(row => row.weldNo)) : false;
  const disabledCertificates = projectCertificates(data.site) || data.offered.some(row => !certificateSelectable(row));

  function chooseWelder(name: string, value: string) {
    if (value && WELDERS.some(other => other !== name && str(values[other]) === value)) { set({ [name]: '' }); notify(DUPLICATE_WELDER); return; }
    set({ [name]: value });
  }
  // Add weld empties Welder 1-4 on every WPS change (the reference refills their lists); Edit weld keeps them.
  function chooseWps(value: string) { set({ wpsId: value, ...(wpsChangeClearsWelders(mode) ? Object.fromEntries(WELDERS.map(name => [name, ''])) : {}) }); }
  // Dia. proposes charges (from the neighbours) and one matching WPS; values already chosen are never changed.
  function chooseDia(value: string) {
    if (value === '__length') { set({ lengthMode: 'Length in mm', diameterId: '' }); return; }
    const next = { ...values, lengthMode: 'Diameter', diameterId: value, dialen: '', ndtpercent: '' };
    const row = data.diameters.get(value), size = diameterRowSize(row), mm = diameterSizeMm(row);
    const index = weld ? order.indexOf(weld.id) : order.length;
    const byId = (id?: string) => id ? data.welds.find(item => item.id === id) ?? null : null;
    const inch = diameterSizeInch(row);
    const matches = inch === null ? [] : activeRows(rows, 'wps').filter(item => item.active !== false && data.project && availableWps(rows, item, data.project.id) && wpsMatchesDiameter(item, inch)).map(item => item.id);
    const suggestion = suggestOnDia({ values: next, diameterSize: size, previous: byId(order[index - 1]), next: byId(order[index + 1]), certificates: data.certs, lookups: data.lookups, matchingWps: matches });
    set({ ...next, ...suggestion.patch, ...(suggestion.wpsId ? { wpsId: suggestion.wpsId } : {}) });
  }
  function chooseWeldNo(value: string) {
    const next = nonWeldCode(value);
    set({ weldNo: value, ...(next ? Object.fromEntries(specialWeldCleared(next).map(name => [name, ''])) : {}) });
  }
  function precheck() {
    const found: Record<string, string> = {};
    if (!str(values.weldNo).trim()) found.weldNo = 'Weld no. is required.';
    if (explicit && values.dialen !== '' && !(Number(values.dialen) > 0)) found.dialen = 'Length in mm must be above zero.';
    if (explicit && values.ndoReq && values.ndtpercent !== '' && !(Number(values.ndtpercent) >= 0 && Number(values.ndtpercent) <= 100)) found.ndtpercent = 'NDT percent must be between 0 and 100.';
    Object.assign(found, duplicateWelderErrors(values), wpsDiameterErrors(data.site, values, chosenWps, weldDiameterOf(values, data.diameters)), diameterErrors({ ...values, defaultDiameter }, { certificates: data.certs, diameters: data.diameters }));
    for (const side of [1, 2]) if (!weld || str(weld[`certificate${side}Id`]) !== str(values[`certificate${side}Id`])) {
      const sides = str(values[`certificate${side}Id`]) ? [side] : [];
      Object.assign(found, certificateSelectionErrors(values, sides, data.certificates), certificateErrors(data.site, values, sides, data.certificates, str(data.project?.id), { links: rows.certificate_projects || [] }));
    }
    return found;
  }
  async function submit(event: FormEvent, asNew = false) {
    event.preventDefault(); setError(''); setFields({});
    if (blocked) { setError(WELD_MANDATORY_MESSAGE); setFields(missing); return; }
    const found = precheck(); if (Object.keys(found).length) { setError(Object.values(found).length === 1 ? Object.values(found)[0] : 'Please check the highlighted fields.'); setFields(found); return; }
    const target = asNew ? undefined : weld, editing = Boolean(target);
    const changes = weldPayload(values, target);
    // Hosted Spool select: the chosen catalog name; the server finds or creates the isometric's spool (server/spool-catalog.ts).
    if (spoolNames && shown('spoolId')) { delete changes.spoolId; if (target ? spoolName !== initialSpool || str(values.spoolId) !== str(target.spoolId) : spoolName) changes[SPOOL_NAME_INPUT] = spoolName; }
    if (target && !Object.keys(changes).length && !updatePrev && !updateNext) { notify('Nothing changed.'); onClose(); return; }
    const payload: Values = { ...changes, isoId: iso.id, ...(target ? { weldId: target.id, expectedVersion: target._version } : {}), ...(!weld && values.tracer ? { tracer: true } : {}), ...(updatePrev && hasPrev && editing ? { updatePrev: true } : {}), ...(updateNext && hasNext && editing ? { updateNext: true } : {}), ...(editing && editReason(note) ? { note: editReason(note) } : {}), ...(diameterCheck.needsRadio && defaultDiameter ? { defaultDiameter } : {}) };
    setBusy(true);
    try { await post('/actions/save-weld', payload); await refresh(); notify(`Weld ${str(values.weldNo)} ${editing ? 'updated' : 'added'}.`); onClose(); }
    catch (failure) { setError(errorMessage(failure)); setFields((failure as ApiError).fields || {}); } finally { setBusy(false); }
  }
  const e = fields, red = (name: string) => Boolean(missing[name]);
  const diameterError = e.diameterId || (!diameterCheck.ok && diameterCheck.reason !== 'pick' && (values.diameterId || diameterCheck.reason === 'mismatch') ? diameterErrors({ ...values, defaultDiameter }, { certificates: data.certs, diameters: data.diameters }).diameterId : undefined);
  function charge(side: 1 | 2) {
    const certificate = selectedCharge(side), details = chargeDetails(certificate, data.lookups);
    return <div className="weld-charge">
      <SelectField label={`Charge number ${side}`} value={chargeValue(values, side)} options={chargeOptions(data, str(values[`certificate${side}Id`]), mode, diaSize, offeredCharges)} error={e[`chargeNo${side}`] && !missing[`chargeNo${side}`] ? e[`chargeNo${side}`] : e[`certificate${side}Id`]} invalid={red(`chargeNo${side}`)} placeholder="-------" hint={disabledCertificates ? `Greyed certificates cannot be selected: both Controlled and Accepted must be enabled.${projectCertificates(data.site) ? ' Only certificates linked to this project are offered.' : ''}` : undefined} onChange={value => set(chargeSelection(value, side, data.certificates))}/>
      {weld && <CheckField label={side === 1 ? 'Upd. prev. weld' : 'Upd. next weld'} checked={side === 1 ? updatePrev : updateNext} disabled={side === 1 ? !hasPrev : !hasNext} hint={`Copies this charge to the adjoining side of the ${side === 1 ? 'previous' : 'next'} weld in table order.`} onChange={side === 1 ? setUpdatePrev : setUpdateNext}/>}
      {details.length > 0 && <table className="weld-charge-details" aria-label={`Material of charge number ${side}`}><tbody>{details.map(([label, value]) => <tr key={label}><th scope="row">{label}</th><td>{value || '—'}</td></tr>)}</tbody></table>}
      {side === 1 && diameterCheck.needsRadio && <fieldset className="weld-default-diameter"><legend>Default diameter:</legend>{diameterCheck.choices.map(size => <label key={size}><input type="radio" name="defaultDiameter" value={size} checked={defaultDiameter === size} onChange={() => setDefaultDiameter(size)}/>{sizeText(size)}</label>)}{(e.defaultDiameter || !diameterCheck.ok && diameterCheck.reason === 'pick') && <small className="field-error">{e.defaultDiameter || DIAMETER_MESSAGES.pick}</small>}</fieldset>}
    </div>;
  }
  const welderField = (name: string, label: string) => {
    if (!shown(name)) return false;
    const options = welderOptionList(welderFor(name), mode);
    return <SelectField key={name} label={label} value={values[name]} error={e[name] && !missing[name] ? e[name] : undefined} placeholder={mode === 'add' && values.wpsId ? WELDER_PLACEHOLDER.add : WELDER_PLACEHOLDER.edit} placeholderDisabled={mode === 'add' && Boolean(values.wpsId)} disabled={welderFieldsDisabled(data.site, values.wpsId) && mode === 'add'} options={options} groups={welderGroups(options)} onChange={value => chooseWelder(name, value)}/>;
  };
  // Labels of the check boxes (Add weld says Pre-WHT): defined before the columns that use them while rendering.
  const flagLabel = (name: string) => weldFormLayout(mode).flat().find(item => item.name === name)?.label ?? name;
  const columns: Record<string, ReactNode> = {
    weldNo: <TextField label="Weld no." required value={values.weldNo} error={e.weldNo} onChange={chooseWeldNo}/>,
    typeId: <SelectField label="Weld type" value={values.typeId} error={e.typeId && !missing.typeId ? e.typeId : undefined} invalid={red('typeId')} placeholder="----------" options={enabled('weld_types', weld?.typeId).map(row => ({ value: row.id, label: str(row.name) }))} onChange={set1('typeId')}/>,
    welder1Id: welderField('welder1Id', 'Welder'), welder2Id: welderField('welder2Id', 'Welder 2'), welder3Id: welderField('welder3Id', 'Welder 3'), welder4Id: welderField('welder4Id', 'Welder 4'),
    coating1Id: <SelectField label="Coating 1" value={values.coating1Id} error={e.coating1Id} placeholder="------" options={options('coatings', nameOf, undefined, weld?.coating1Id)} onChange={set1('coating1Id')}/>,
    coatingWeldId: <SelectField label="Coating weld" value={values.coatingWeldId} error={e.coatingWeldId} placeholder="------" options={options('coatings', nameOf, undefined, weld?.coatingWeldId)} onChange={set1('coatingWeldId')}/>,
    coating2Id: <SelectField label="Coating 2" value={values.coating2Id} error={e.coating2Id} placeholder="------" options={options('coatings', nameOf, undefined, weld?.coating2Id)} onChange={set1('coating2Id')}/>,
    kr: <TextField label="KR" value={values.kr} error={e.kr} onChange={set1('kr')}/>, fp: <TextField label="FP" value={values.fp} error={e.fp} onChange={set1('fp')}/>,
    sleeve: <TextField label="Sleeve" value={values.sleeve} error={e.sleeve} onChange={set1('sleeve')}/>,
    insLength: <TextField label="Ins. length 1" value={values.insLength} error={e.insLength} onChange={set1('insLength')}/>, insLength2: <TextField label="Ins. length 2" value={values.insLength2} error={e.insLength2} onChange={set1('insLength2')}/>,
    wire1Id: <SelectField label="Welding wire 1" value={values.wire1Id} error={e.wire1Id} placeholder="------" options={options('welding_wires', wireOf)} onChange={set1('wire1Id')}/>,
    wire2Id: <SelectField label="Welding wire 2" value={values.wire2Id} error={e.wire2Id} placeholder="------" options={options('welding_wires', wireOf)} onChange={set1('wire2Id')}/>,
    pos1: <TextField label="Pos 1" value={values.pos1} error={e.pos1} onChange={set1('pos1')}/>, pos2: <TextField label="Pos 2" value={values.pos2} error={e.pos2} onChange={set1('pos2')}/>,
    chargeNo1: charge(1), chargeNo2: charge(2),
    wpsId: <SelectField label="WPS number" value={values.wpsId} error={e.wpsId && !missing.wpsId ? e.wpsId : undefined} invalid={red('wpsId')} placeholder="----------" options={wpsOptions} hint="Only procedures available to this project." onChange={chooseWps}/>,
    datefit: <TextField label={mode === 'add' ? 'Fitup date' : 'Fitup Date'} type="date" value={values.datefit} error={e.datefit} onChange={set1('datefit')}/>,
    date: <TextField label="Weld Date" type="date" value={values.date} error={e.date && !missing.date ? e.date : undefined} invalid={red('date')} onChange={set1('date')}/>,
    diameterId: <SelectField label="Dia." value={explicit ? '__length' : diameterOptionValue(diameters, values.diameterId)} error={diameterError} invalid={red('diameterId')} placeholder="----------" options={[{ value: '__length', label: '-- Length in mm --' }, ...diameters]} onChange={chooseDia}/>,
    dialen: explicit && <TextField label="Length in mm" type="number" min={0} value={values.dialen} error={e.dialen && !missing.dialen ? e.dialen : undefined} invalid={red('dialen')} onChange={value => set({ dialen: value === '' ? '' : Number(value) })}/>,
    spoolId: spoolNames ? <SelectField label="Spool" value={spoolName} error={e.spoolId} placeholder="----------" options={spoolNames.map(name => ({ value: name, label: name }))} onChange={setSpoolName}/> : <SelectField label="Spool" value={values.spoolId} error={e.spoolId} placeholder="----------" options={options('spools', nameOf, row => row.isoId === iso.id)} onChange={set1('spoolId')}/>,
    ndtpercent: explicit && Boolean(values.ndoReq) && <TextField label="NDT percent" type="number" min={0} max={100} value={values.ndtpercent} error={e.ndtpercent} hint="0 to 100." onChange={value => set({ ndtpercent: value === '' ? '' : Number(value) })}/>,
    ...Object.fromEntries(FLAGS.map(name => [name, <CheckField key={name} label={flagLabel(name)} checked={Boolean(values[name])} onChange={set1(name)}/>])),
    tracer: weld ? <CheckField label="Tracer" checked={Boolean(weld.tracer)} disabled hint={EDIT_TRACER_HINT}/> : <CheckField label="Tracer" checked={Boolean(values.tracer)} error={e.tracer} onChange={set1('tracer')}/>,
  };
  const layout = weldFormLayout(mode).map(column => column.filter(item => !['updatePrev', 'updateNext'].includes(item.name) && shown(item.name)));
  const saveBlocked = busy || blocked || reasonMissing;
  // Delete weld swaps the dialog for the confirmation; Cancel brings the weld back with what was typed (this component stays mounted).
  if (deleting && weld) return <DeleteDialog welds={[weld]} onClose={() => setDeleting(false)} onDone={() => { onDeleted?.(); onClose(); }}/>;
  return <Modal title={weld ? 'Edit weld' : 'Add weld'} subtitle={`${str(iso.isoNo)}${weld ? ` · ${str(weld.weldNo)}` : ''}`} wide onClose={onClose}>
    <form onInvalidCapture={revealInvalidField} onSubmit={event => void submit(event)} noValidate>
      <div className="modal-body weld-form">
        {lockedReason && <div className="alert iso-lock-banner" role="status"><Lock size={16} aria-hidden="true"/><span><strong>{lockedReason}</strong> Weld {str(weld?.weldNo)} is read-only.</span></div>}
        {!lockedReason && ndt.locked && <div className="alert iso-lock-banner" role="status"><Lock size={16} aria-hidden="true"/><span><strong>{NDT_LOCK_REASON}</strong> {ndt.editable ? 'Enter a change comment to save a change.' : `Weld ${str(weld?.weldNo)} is read-only for you; NDT results can still be attached below.`}</span></div>}
        {weld && <PreviousEdits weldId={weld.id}/>}
        {reasonNeeded && !readOnly && <div className="weld-reason">
          <div className="alert weld-warning" role="note"><AlertCircle size={18}/><span><strong>Warning</strong><br/>{ndt.locked ? NDT_LOCK_COMMENT_REQUIRED : EDIT_REASON_WARNING}</span></div>
          <div className="field"><label htmlFor="weld-edit-reason">{ndt.locked ? NDT_LOCK_COMMENT_LABEL : EDIT_REASON_LABEL}</label><textarea id="weld-edit-reason" required maxLength={EDIT_REASON_MAX} rows={3} value={note} placeholder={ndt.locked ? 'Why does this weld change?' : EDIT_REASON_LABEL} aria-invalid={Boolean(e.note)} aria-describedby={e.note ? 'weld-edit-reason-error' : undefined} onChange={event => setNote(event.target.value)}/>{e.note && <small id="weld-edit-reason-error" className="field-error">{e.note}</small>}</div>
        </div>}
        <Failure message={error}/>
        <fieldset className="weld-form-fields" disabled={readOnly}>
        <div className="weld-form-columns">{layout.map((column, index) => <div key={index} className={`weld-form-column weld-form-column-${index + 1}`}>{column.map(item => <Fragment key={item.name}>{columns[item.name]}</Fragment>)}</div>)}</div>
        </fieldset>
        {blocked && !readOnly && <p className="weld-blocked muted" role="status">{WELD_MANDATORY_MESSAGE}</p>}
        <MaterialWarnings warnings={warnings}/>
        {weld && <NdtResultSection weld={weld} phaseLocked={Boolean(lockedReason)}/>}
      </div>
      <div className="modal-footer">
        {weld && onDeleted && !lockedReason && ndt.editable && <button type="button" className="btn weld-dialog-delete" disabled={busy} onClick={() => setDeleting(true)}><Trash2 size={15} aria-hidden="true"/>{WELD_DELETE_WORDING.one}</button>}
        <button type="button" className="btn" disabled={busy} onClick={onClose}>{readOnly ? 'Close' : 'Cancel'}</button>
        {weld && !readOnly && <button type="button" className="btn" disabled={saveBlocked || !addNew} title={addNew ? undefined : 'Change Weld no. to a number this isometric does not have yet.'} onClick={event => void submit(event as unknown as FormEvent, true)}>Add new</button>}
        {!readOnly && <button className="btn primary" disabled={saveBlocked}>{busy && <Loader2 size={15} className="spin"/>}{weld ? 'Update' : 'Add'}</button>}
      </div>
    </form>
  </Modal>;
}

// --------------------------------------------------------------------------------------------------- add welds (range)

/** The reference's #addWelds: title "Add weld", Weld no. Start 001, Weld no. End 015, Dia., Add / Cancel. Opened by the toolbar button "Add welds". */
function RangeDialog({ iso, data, onClose }: { iso: Row; data: WeldData; onClose: () => void }) {
  const { refresh, notify } = useWorkspace();
  const [start, setStart] = useState<string>(RANGE_DIALOG.start), [end, setEnd] = useState<string>(RANGE_DIALOG.end), [diameterId, setDiameter] = useState('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const diameters = useDiameterOptions(true);
  let plan: ReturnType<typeof planWeldRange> | null = null, problem = '';
  if (start.trim() !== '' && end.trim() !== '') { try { plan = planWeldRange(start.trim(), end.trim(), data.welds.map(weld => str(weld.weldNo))); } catch (failure) { problem = (failure as Error).message; } }
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    if (start.trim() === '' || end.trim() === '') { setError('Enter Weld no. Start and End.'); return; }
    setBusy(true);
    try {
      const result = await post<{ skipped?: string[] }>('/actions/add-welds', { isoId: iso.id, start: start.trim(), end: end.trim(), ...(diameterId ? { diameterId } : {}) });
      await refresh(); notify(`${plan?.numbers.length ?? 'The'} welds added.${result?.skipped?.length ? ` ${rangeSkippedMessage(result.skipped)}` : ''}`); onClose();
    }
    catch (failure) { setError(errorMessage(failure)); } finally { setBusy(false); }
  }
  return <Modal title={RANGE_DIALOG.title} subtitle={str(iso.isoNo)} onClose={onClose}>
    <form onSubmit={event => void submit(event)} noValidate><div className="modal-body">
      <Failure message={error || problem}/>
      <div className="form-grid">
        <TextField label="Weld no. Start" required value={start} onChange={setStart}/>
        <TextField label="Weld no. End" required value={end} onChange={setEnd}/>
        <SelectField label="Dia." value={diameterOptionValue(diameters, diameterId)} placeholder="----------" options={diameters} onChange={setDiameter}/>
      </div>
      {plan && <p className="weld-range-preview" role="status">{plan.numbers.length ? <>Adds <strong>{plan.numbers.length}</strong> {plan.numbers.length === 1 ? 'weld' : 'welds'}: {plan.numbers.slice(0, 8).join(', ')}{plan.numbers.length > 8 ? ` … ${plan.numbers.at(-1)}` : ''}.</> : 'Every number in this range already exists.'}{plan.skipped.length > 0 && <> Skipped, already on the isometric: {plan.skipped.slice(0, 8).join(', ')}{plan.skipped.length > 8 ? '…' : ''}.</>}</p>}
    </div><div className="modal-footer"><button type="button" className="btn" disabled={busy} onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || !plan?.numbers.length}>{busy && <Loader2 size={15} className="spin"/>}{RANGE_DIALOG.button}</button></div></form>
  </Modal>;
}

// --------------------------------------------------------------------------------------------------- mass edit

type Touch = Values;
function MassEditDialog({ iso, data, selected, onClose, onDone }: { iso: Row; data: WeldData; selected: Row[]; onClose: () => void; onDone: () => void }) {
  const { rows, refresh, notify } = useWorkspace();
  const [changes, setChanges] = useState<Touch>({}), [clear, setClear] = useState({ datefit: false, date: false }), [lengthMode, setLengthMode] = useState(false);
  const [error, setError] = useState(''), [fields, setFields] = useState<Record<string, string>>({}), [busy, setBusy] = useState(false);
  // Checked welds with an NDT request (an administrator's mass edit): the change comment is required and kept on each of them.
  const [comment, setComment] = useState(''), lockedWelds = selected.filter(weld => ndtLock(data.requests, weld.id, true).locked);
  const set = (name: string) => (value: unknown) => setChanges(current => { const next = { ...current }; if (value === '' || value === undefined) delete next[name]; else next[name] = value; return next; });
  // Mass edit sets new values only, so catalog records switched off on the active main project are not offered.
  const options = (key: string, label: (row: Row) => string = row => str(row.name)) => sortByName(enabledOptions(key, activeRows(rows, key), str(data.site?.id), rows), 'name').map(row => ({ value: row.id, label: label(row) }));
  const diameters = useDiameterOptions();
  // Mass edit shows the WPS as "process | number (designation)" (reference, wpsLabel 'mass').
  // With "Validation on WPS" on, only WPS whose range holds the diameter of every checked weld (or the diameter set here) are offered, and welders qualified for it.
  const newDiameter = changes.diameterId ? weldDiameterOf({ diameterId: changes.diameterId }, data.diameters) : null;
  const diametersOf = selected.map(weld => changes.dialen !== undefined ? null : newDiameter ?? weldDiameterOf(weld, data.diameters));
  const wpsOptions = activeRows(rows, 'wps').filter(row => row.active !== false && data.project && availableWps(rows, row, data.project.id) && wpsOfferedForDiameters(data.site, row, diametersOf.map(item => item?.inch ?? null))).map(row => ({ value: row.id, label: wpsLabel(row, 'mass') }));
  const flag = (name: string, label: string) => <SelectField key={name} label={label} value={changes[name] === undefined ? '' : changes[name] ? 'yes' : 'no'} placeholder="Keep current" options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} onChange={value => set(name)(value === '' ? '' : value === 'yes')}/>;
  const chargeField = (entry: MassEditItem) => { const side = entry.side!; return <SelectField key={entry.name} label={entry.label} value={chargeValue(changes, side)} placeholder="Keep current" options={chargeOptions(data, str(changes[`certificate${side}Id`]))} error={fields[`chargeNo${side}`] || fields[`certificate${side}Id`]} onChange={value => setChanges(current => { const next = { ...current }; for (const name of [`chargeNo${side}`, `certificate${side}Id`, `material${side}Id`]) delete next[name]; return value ? { ...next, ...chargeSelection(value, side, data.certificates) } : next; })}/>; };
  // A WPS change empties the four welder fields (Mass edit as Add weld; the reference refills their lists).
  const chooseWps = (value: unknown) => setChanges(current => { const next = { ...current }; for (const name of WELDERS) delete next[name]; if (value === '' || value === undefined) delete next.wpsId; else next.wpsId = value; return next; });
  const warnings = groupWarnings(data, data.certs.get(str(changes.certificate1Id)), data.certs.get(str(changes.certificate2Id)), data.wps.get(str(changes.wpsId)));
  const control = (entry: MassEditItem, extra?: string) => {
    if (entry.control === 'text') return <TextField key={entry.name} label={entry.label} value={changes[entry.name]} onChange={set(entry.name)}/>;
    if (entry.control === 'charge') return chargeField(entry);
    if (entry.control === 'welder') {
      // Lists are full at once with '-----------------' (keep); a WPS change empties the four welders and refills them, 'Choose Welder' first (reference #wpsNoFormMass).
      const chosen = data.wps.get(str(changes.wpsId)), list = welderOptionList(chosen ? weldersForWps(data.site, rows.welders || [], rows.welder_certificates as Row[] | undefined, chosen, todayText(), [], diametersOf.map(item => item?.mm ?? null)) : (rows.welders || []).filter(row => !row._archived && row.status !== 'Inactive'), 'mass');
      return <SelectField key={entry.name} label={entry.label} value={changes[entry.name]} error={fields[entry.name]} placeholder={chosen ? WELDER_PLACEHOLDER.add : WELDER_PLACEHOLDER.mass} placeholderDisabled={Boolean(chosen)} options={list} onChange={set(entry.name)}/>;
    }
    const list = entry.control === 'wps' ? wpsOptions : options(entry.catalog!);
    return <SelectField key={entry.name} label={entry.label} extra={extra} value={changes[entry.name]} error={fields[entry.name]} placeholder="Keep current" options={list} onChange={entry.control === 'wps' ? chooseWps : set(entry.name)}/>;
  };
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setFields({});
    const body = { ...changes, ...(clear.datefit ? { clearDatefit: true } : {}), ...(clear.date ? { clearDate: true } : {}) };
    if (lengthMode && changes.dialen === undefined) { setError('Length in mm must be a number above zero.'); setFields({ dialen: 'Length in mm must be a number above zero.' }); return; }
    const read = readMassEdit(body);
    if (Object.keys(read.errors).length) { setError(read.errors._ || Object.values(read.errors)[0]); setFields(read.errors); return; }
    if (selected.some(weld => massEditMissingFields(data.site, weld, read.changes).length)) { setError(MASS_EDIT_MANDATORY_MESSAGE); return; }
    const unselectable = certificateSelectionErrors(read.changes, [1, 2], data.certificates);
    if (Object.keys(unselectable).length) { setError(CERTIFICATE_NOT_SELECTABLE); setFields(Object.fromEntries(Object.keys(unselectable).map(name => [name.replace('certificate', 'chargeNo').replace('Id', ''), CERTIFICATE_NOT_SELECTABLE]))); return; }
    if (lockedWelds.length && !editReason(comment)) { setError(NDT_LOCK_COMMENT_REQUIRED); return; }
    setBusy(true);
    try { await post('/actions/mass-edit-welds', { weldIds: selected.map(row => row.id), versions: Object.fromEntries(selected.map(row => [row.id, row._version])), changes: body, ...(lockedWelds.length ? { note: editReason(comment) } : {}) }); await refresh(); notify(`${selected.length} ${selected.length === 1 ? 'weld' : 'welds'} updated.`); onDone(); onClose(); }
    catch (failure) { setError(errorMessage(failure)); setFields((failure as ApiError).fields || {}); } finally { setBusy(false); }
  }
  const e = fields;
  return <Modal title="Mass edit welds" subtitle={`${str(iso.isoNo)} · ${selected.length} checked ${selected.length === 1 ? 'weld' : 'welds'}`} wide onClose={onClose}>
    <form onInvalidCapture={revealInvalidField} onSubmit={event => void submit(event)} noValidate><div className="modal-body weld-form">
      <Failure message={error}/>
      {lockedWelds.length > 0 && <div className="weld-reason">
        <div className="alert iso-lock-banner" role="note"><Lock size={16} aria-hidden="true"/><span><strong>{NDT_LOCK_REASON}</strong> Checked with an NDT request: {lockedWelds.map(weld => str(weld.weldNo)).join(', ')}.</span></div>
        <div className="field"><label htmlFor="weld-mass-comment">{NDT_LOCK_COMMENT_LABEL}</label><textarea id="weld-mass-comment" required maxLength={EDIT_REASON_MAX} rows={2} value={comment} placeholder="Why do these welds change?" onChange={event => setComment(event.target.value)}/></div>
      </div>}
      <p className="muted">Only the fields you change are written. Fields left on “Keep current” stay as they are on every checked weld.</p>
      <div className="form-grid weld-mass-columns">{MASS_EDIT_COLUMNS.map((column, index) => <div key={index}>{column.map(entry => control(entry))}</div>)}</div>
      <div className="form-grid">
        {MASS_EDIT_DATES.map(date => <div key={date.name} className="weld-clearable"><TextField label={date.label} type="date" hint={MASS_EDIT_DATE_HINT} value={clear[date.name] ? '' : changes[date.name]} error={e[date.name]} onChange={value => { setClear(current => ({ ...current, [date.name]: false })); set(date.name)(value); }}/><CheckField label={MASS_EDIT_CLEAR_LABEL} checked={clear[date.name]} onChange={checked => { setClear(current => ({ ...current, [date.name]: checked })); if (checked) set(date.name)(''); }}/></div>)}
        <SelectField label={MASS_EDIT_DIAMETER.label} value={lengthMode ? '__length' : changes.diameterId} error={e.diameterId} placeholder="Keep current" options={[{ value: '__length', label: MASS_EDIT_DIAMETER.lengthOption }, ...diameters]} onChange={value => { setLengthMode(value === '__length'); if (value === '__length') set('diameterId')(''); else { set('dialen')(''); set('diameterId')(value); } }}/>
        {lengthMode && <TextField label={MASS_EDIT_DIAMETER.lengthLabel} type="number" min={0} value={changes.dialen} error={e.dialen} onChange={value => set('dialen')(value === '' ? '' : Number(value))}/>}
      </div>
      <div className="form-grid">{MASS_EDIT_FLAGS_LABELS.map(([name, label]) => flag(name, label))}</div>
      {MASS_EDIT_SECTIONS.map(section => <div key={section.title}><h3 className="weld-form-section">{section.title}</h3>
        <div className="form-grid">{section.items.map((entry, index) => control(entry, entry.label === 'NDT process' && section.title !== 'Pre-HT / PWHT' ? NDT_ROUNDS[index - 1]?.label : undefined))}</div></div>)}
      <MaterialWarnings warnings={warnings}/>
    </div><div className="modal-footer"><button type="button" className="btn" disabled={busy} onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>{busy && <Loader2 size={15} className="spin"/>}Update</button></div></form>
  </Modal>;
}

// --------------------------------------------------------------------------------------------------- stamp, delete, bring back

/** The reference's Stamp dialog: one select with the QA/QC person who stamped the weld (stored on the weld). */
function StampDialog({ weld, data, onClose }: { weld: Row; data: WeldData; onClose: () => void }) {
  const { rows, refresh, notify } = useWorkspace();
  const [value, setValue] = useState(str(weld.stampedBy));
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const people = sortByName(enabledOptions('qa_engineers', activeRows(rows, 'qa_engineers'), str(data.site?.id), rows, weld.stampedBy), 'name').map(row => ({ value: row.id, label: stampOptionLabel(row) }));
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    if (value === str(weld.stampedBy)) { onClose(); return; }
    setBusy(true);
    try { await post('/actions/stamp-weld', { weldId: weld.id, expectedVersion: weld._version, stampedBy: value }); await refresh(); notify(`Stamp of weld ${str(weld.weldNo)} saved.`); onClose(); }
    catch (failure) { setError(errorMessage(failure)); } finally { setBusy(false); }
  }
  return <Modal title="Stamp" subtitle={`Weld ${str(weld.weldNo)}`} onClose={onClose}><form onSubmit={event => void submit(event)} noValidate><div className="modal-body"><Failure message={error}/>
    <SelectField label="Stamp" value={value} placeholder={STAMP_NONE} options={people} onChange={setValue}/>
  </div><div className="modal-footer"><button type="button" className="btn" disabled={busy} onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>{busy && <Loader2 size={15} className="spin"/>}Update</button></div></form></Modal>;
}

/** Delete one or several checked welds: "Are you sure?" first, then each weld on its own (a locked weld stays and says why). */
function DeleteDialog({ welds, onClose, onDone }: { welds: Row[]; onClose: () => void; onDone: () => void }) {
  const { refresh, notify } = useWorkspace(); const [items] = useState(welds);
  const [busy, setBusy] = useState(false), [failed, setFailed] = useState<{ id: string; weldNo: string; message: string }[]>([]), [deleted, setDeleted] = useState(0);
  async function submit() {
    setBusy(true); const problems: typeof failed = []; let done = 0;
    for (const weld of items) { try { await post(`/records/welds/${weld.id}/archive`, { _version: weld._version }); done++; } catch (failure) { problems.push({ id: weld.id, weldNo: str(weld.weldNo), message: errorMessage(failure) }); } }
    try { await refresh(); } catch { /* the workspace shows its own connection error */ }
    setDeleted(done); setFailed(problems); setBusy(false);
    if (!problems.length) { notify(`${done} ${done === 1 ? 'weld' : 'welds'} deleted.`); onDone(); onClose(); } else if (done) onDone();
  }
  const finished = failed.length > 0;
  return <Modal title={items.length === 1 ? WELD_DELETE_WORDING.one : WELD_DELETE_WORDING.many} onClose={onClose}>
    <div className="modal-body">{finished ? <div className="alert error" role="alert"><AlertCircle size={18}/><div><strong>{deleted} deleted, {failed.length} could not be deleted.</strong><ul>{failed.map(item => <li key={item.id}>Weld {item.weldNo}: {item.message}</li>)}</ul></div></div> : <p>{WELD_DELETE_WORDING.text}</p>}</div>
    <div className="modal-footer"><button type="button" className="btn" disabled={busy} onClick={onClose}>{finished ? 'Close' : WELD_DELETE_WORDING.cancel}</button>{!finished && <button className="btn primary danger" disabled={busy} onClick={() => void submit()}>{busy && <Loader2 size={15} className="spin"/>}{WELD_DELETE_WORDING.button}</button>}</div>
  </Modal>;
}

/** The undo icon of a deleted weld: "Bring weld back", "Are you sure?", Bring back / Cancel. */
function BringBackDialog({ weld, onClose, onBack }: { weld: Row; onClose: () => void; onBack: () => void }) {
  const { refresh, notify } = useWorkspace(); const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function bring() {
    setBusy(true); setError('');
    try { await post(`/records/welds/${weld.id}/archive`, { _version: weld._version }); await refresh(); notify(`Weld ${str(weld.weldNo)} is back in the table.`); onBack(); onClose(); } catch (failure) { setError(errorMessage(failure)); } finally { setBusy(false); }
  }
  return <Modal title={WELD_BRING_BACK_WORDING.title} onClose={onClose}><div className="modal-body"><Failure message={error}/><p>{WELD_BRING_BACK_WORDING.text}</p></div>
    <div className="modal-footer"><button type="button" className="btn" disabled={busy} onClick={onClose}>{WELD_BRING_BACK_WORDING.cancel}</button><button type="button" className="btn primary" disabled={busy} onClick={() => void bring()}>{busy && <Loader2 size={15} className="spin"/>}{WELD_BRING_BACK_WORDING.button}</button></div></Modal>;
}

// --------------------------------------------------------------------------------------------------- the table

/**
 * The LISL table of the isometric (client change list 22.11.2026, images 16–19): no sort column, no search, no padlocks;
 * WD / VT / Spool headers and Pre-HT and PWHT as two columns. `table-layout: fixed` with the widths of client/weld-entry.css
 * fits the table without horizontal scrolling from 1280 px with the sidebar open; the two Material columns take the rest.
 */
export const LISL_COLUMNS: { key: string; label: string; title?: string }[] = [
  { key: 'wn', label: 'WN', title: 'Weld number' }, { key: 'type', label: 'Type', title: 'Weld type' }, { key: 'wd', label: 'WD', title: 'Welders (stamps)' }, { key: 'vt', label: 'VT', title: 'Visual testing' },
  { key: 'ndt-pre', label: 'NDT (Pre)' }, { key: 'ndt', label: 'NDT' }, { key: 'pre-ht', label: 'Pre-HT', title: 'Pre-heat treatment' }, { key: 'pwht', label: 'PWHT', title: 'Post-weld heat treatment' },
  { key: 'idx-1', label: 'Idx', title: 'Index no. ①' }, { key: 'chg-1', label: 'Chg.No.', title: 'Charge no. ①' }, { key: 'mat-1', label: 'Material ①' },
  { key: 'idx-2', label: 'Idx', title: 'Index no. ②' }, { key: 'chg-2', label: 'Chg.No.', title: 'Charge no. ②' }, { key: 'mat-2', label: 'Material ②' },
  { key: 'wps', label: 'WPS' }, { key: 'd', label: 'D', title: 'Diameter' }, { key: 'spool', label: 'Spool' }, { key: 'options', label: 'Options' },
];

/** What the isometric page hands the LISL: its own Options entries and where the actions and the panel go. */
export interface WeldsPanelProps {
  iso: Row;
  /** An entry of the page's own part of the Options menu (ISO_PAGE_MENU keys); null when the page does not offer it. */
  pageItem: (key: string, label: string) => ReactNode;
  /** Places the Options menu and Add weld in the page's top line and the LISL panel under the header cards. */
  layout: (parts: { menu: ReactNode; addWeld: ReactNode; panel: ReactNode }) => ReactNode;
}

function WeldTable({ iso, pageItem, layout }: WeldsPanelProps) {
  const { canRecord, canRun, refresh, notify, user } = useWorkspace(); const data = useWeldData(iso);
  const [selected, setSelected] = useState<string[]>([]), [showDeleted, setShowDeleted] = useState(false);
  const [dialog, setDialog] = useState<'add' | 'range' | 'mass' | 'delete' | 'punch' | null>(null), [editing, setEditing] = useState<Row | null>(null), [stamping, setStamping] = useState<Row | null>(null), [removing, setRemoving] = useState<Row[]>([]), [restoring, setRestoring] = useState<Row | null>(null);
  // NDT / visual inspection / PWHT entries of the inspections flow (already filtered by permission and the 'inspections' feature).
  const inspectionMenu = useInspectionMenu(str(iso.id)), [inspection, setInspection] = useState<InspectionMenuItem | null>(null);
  const { welds } = data;
  const locks = new Map([...welds, ...data.deleted].map(weld => [weld.id, weldLock(weld, data.lock)]));
  // NDT lock: a weld with an NDT request; only an administrator changes or deletes it (the server says the same). The weld itself says so, the table shows no padlock.
  const administrator = isAdministrator(user);
  const ndtLocks = new Map([...welds, ...data.deleted].map(weld => [weld.id, ndtLock(data.requests, weld.id, administrator)]));
  const frozen = (weld: Row) => locks.get(weld.id)!.locked || !ndtLocks.get(weld.id)!.editable;
  const sideOf = (weld: Row, side: 1 | 2) => {
    const certificate = data.certs.get(str(weld[`certificate${side}Id`])), material = data.materials.get(str(weld[`material${side}Id`] || certificate?.materialId));
    return sideSummary(weld, side, { certificate, material, materialType: str(data.materialTypes.get(str(material?.typeId))?.name), materialPart: str(data.materialParts.get(str(material?.partId))?.name) });
  };
  const weldersOf = (weld: Row) => WELDERS.map(name => data.welders.get(str(weld[name]))).filter((row): row is Row => Boolean(row));
  const listed = showDeleted ? data.deleted : welds;
  const checked = showDeleted ? [] : listed.filter(weld => selected.includes(weld.id) && !locks.get(weld.id)!.locked);
  const unlocked = showDeleted ? [] : listed.filter(weld => !locks.get(weld.id)!.locked);
  // Checked welds still go to the NDT / VT / PWHT actions; Mass edit and Delete refuse a checked weld locked by its NDT request.
  const ndtFrozen = checked.find(frozen);
  const editChecked = (open: () => void) => { if (!checked.length) notify(MASS_EDIT_SELECT_NOTHING); else if (ndtFrozen) notify(ndtLockRefusal(ndtFrozen.weldNo)); else open(); };
  const canAdd = canRun('save-weld', {}), canEdit = canRun('save-weld', { weldId: 'x' }), canOpen = canEdit || NDT_TYPES.some(type => canRun('inspection-upload', { type })), canMass = canRun('mass-edit-welds'), canDelete = canRecord('welds', 'delete');
  async function toggleDeleted() { setShowDeleted(value => !value); setSelected([]); try { await refresh(); } catch { /* the workspace shows its own connection error */ } }
  const sideCells = (weld: Row, side: 1 | 2) => {
    const summary = sideOf(weld, side), text = sideCellTexts(summary);
    return <><td className="tabular">{text.index}</td><td className="tabular weld-wrap">{text.charge}</td><td className={`weld-material ${summary.kind}`}><span className="weld-clamp" title={text.material}>{text.material}</span></td></>;
  };
  const readable = canRecord('welds');
  const inspectionItem = (key: string) => inspectionMenu.find(item => item.key === key);
  const menuItem = (key: string, label: string): ReactNode => {
    switch (key) {
      case 'add-welds': return readable ? <button type="button" disabled={!canRun('add-welds') || showDeleted} onClick={() => setDialog('range')}>{label}</button> : null;
      case 'mass-edit': return readable ? <button type="button" disabled={!canMass || showDeleted} onClick={() => editChecked(() => setDialog('mass'))}>{label}{checked.length > 0 && <span className="count-pill">{checked.length}</span>}</button> : null;
      case 'punch-list': return canRecord('punchlists') ? <button type="button" onClick={() => setDialog('punch')}>{label}</button> : null;
      case 'show-deleted': return readable ? <button type="button" onClick={() => void toggleDeleted()}>{showDeleted ? WELD_BRING_BACK_WORDING.showActive : label}</button> : null;
      case 'delete-selected': return readable ? <button type="button" className="dropdown-danger" disabled={!canDelete || !checked.length} onClick={() => editChecked(() => { setRemoving(checked); setDialog('delete'); })}>{label}</button> : null;
      case 'visual-inspection': case 'mass-ndt-pre': case 'mass-ndt': case 'mass-pwht': case 'upload-pwht': {
        const item = readable ? inspectionItem(key) : undefined; if (!item) return null;
        const count = key === 'visual-inspection' ? /\s\((\d+)\)$/.exec(item.label)?.[1] : undefined;
        return <button type="button" onClick={() => setInspection(item)}>{label}{count !== undefined && <span className="count-pill">{count}</span>}</button>;
      }
      default: return pageItem(key, label);
    }
  };
  const menu = <Dropdown label="Options" trigger={<span className="btn">Options<ChevronDown size={15}/></span>}>
    {menuGroups(WELD_OPTIONS_MENU, entry => menuItem(entry.key, entry.label)).map((group, index) => <Fragment key={group.group}>{index > 0 && <div role="separator" className="dropdown-divider"/>}{group.items.map(item => <Fragment key={item.key}>{item.node}</Fragment>)}</Fragment>)}
  </Dropdown>;
  const addWeld = readable ? <button type="button" className="btn primary" disabled={!canAdd || showDeleted} onClick={() => setDialog('add')}><Plus size={16}/>Add weld</button> : null;
  if (!readable) return <>{layout({ menu, addWeld, panel: <section className="panel weld-panel" aria-label="LISL"><EmptyState title="Weld register restricted" description="Your permission profile does not include the weld register."/></section> })}</>;
  const editingLock = editing ? locks.get(editing.id) : undefined;
  const titleId = `weld-panel-title-${iso.id}`;
  const panel = <section className="panel weld-panel" aria-labelledby={titleId}>
    <div className="panel-heading weld-panel-heading"><div><h2 id={titleId}>LISL</h2>{showDeleted && <Badge color="amber">Deleted welds</Badge>}</div>
      <div className="heading-actions weld-actions">
        {checked.length > 0 && <span className="weld-checked" role="status">{checked.length} checked</span>}
        {checked.length > 0 && canMass && <button type="button" className="btn small" onClick={() => editChecked(() => setDialog('mass'))}>Mass edit welds</button>}
        {checked.length > 0 && <button type="button" className="btn small" onClick={() => setSelected([])}>Clear</button>}
        {showDeleted && <button type="button" className="btn small" onClick={() => void toggleDeleted()}>{WELD_BRING_BACK_WORDING.showActive}</button>}
      </div></div>
    {listed.length ? <div className="weld-table-box" tabIndex={0} role="region" aria-labelledby={titleId}><table className="data-table weld-table" aria-label={`${showDeleted ? 'Deleted welds' : 'Welds'} of ${str(iso.isoNo)}`}>
      <colgroup>{LISL_COLUMNS.map(column => <col key={column.key} className={`weld-col-${column.key}`}/>)}<col className="weld-col-select"/></colgroup>
      <thead><tr>{LISL_COLUMNS.map(column => <th key={column.key} scope="col" title={column.title}>{column.label}</th>)}<th scope="col" className="select-cell"><input type="checkbox" aria-label="Check all unlocked welds" disabled={showDeleted} checked={unlocked.length > 0 && unlocked.every(weld => selected.includes(weld.id))} ref={input => { if (input) input.indeterminate = unlocked.some(weld => selected.includes(weld.id)) && !unlocked.every(weld => selected.includes(weld.id)); }} onChange={event => setSelected(current => event.target.checked ? [...new Set([...current, ...unlocked.map(weld => weld.id)])] : current.filter(id => !unlocked.some(weld => weld.id === id)))}/></th></tr></thead>
      <tbody>{listed.map(weld => {
        const lock = locks.get(weld.id)!, ndt = ndtLocks.get(weld.id)!, type = data.types.get(str(weld.typeId)), stamps = welderStamps(weldersOf(weld)), stamper = data.stampers.get(str(weld.stampedBy));
        const abbreviation = typeAbbreviation(type), tooltip = locationTooltip(type), wps = str(data.wps.get(str(weld.wpsId))?.name);
        // A locked weld (completed phase, or an NDT request for a non-administrator) opens read-only with the reason banner; the row looks like any other.
        const readOnly = lock.locked || !(ndt.editable && canEdit);
        const editLabel = readOnly ? `Open weld ${str(weld.weldNo)} (read-only${lock.locked ? `: ${lock.reason}` : ndt.locked ? '; NDT results can be attached' : ''})` : `Edit weld ${str(weld.weldNo)}`;
        return <tr key={weld.id}>
          <td className="weld-no">{canOpen && !showDeleted ? <button type="button" className="record-link" title={readOnly ? editLabel : undefined} onClick={() => setEditing(weld)}>{str(weld.weldNo)}</button> : str(weld.weldNo)}</td>
          <td>{abbreviation ? <span className="weld-type" tabIndex={0} title={tooltip} aria-label={`${abbreviation}, ${tooltip}`}>{abbreviation}</span> : <span className="muted">-</span>}</td>
          <td className="weld-wrap">{stamps.length ? stamps.map((stamp, index) => <span key={index} title={stamp.name}>{index ? ', ' : ''}{stamp.code}</span>) : <span className="muted">{NO_WELDER_TEXT}</span>}</td>
          <td><InspectionCell weld={weld} kind="VI"/></td><td><InspectionCell weld={weld} kind="NDT PRE"/></td><td><InspectionCell weld={weld} kind="NDT"/></td>
          {HEAT_TYPES.map(heat => <td key={heat}><InspectionCell weld={weld} kind="PWHT" heat={heat}/></td>)}
          {sideCells(weld, 1)}{sideCells(weld, 2)}
          <td>{wps ? <span className="weld-clamp" title={wps}>{wps}</span> : <span className="muted">—</span>}</td>
          <td className="tabular weld-wrap">{weldDiameterText(weld, data.diameters.get(str(weld.diameterId))) || <span className="muted">—</span>}</td>
          <td className="weld-wrap">{str(data.spools.get(str(weld.spoolId))?.name) || <span className="muted">—</span>}</td>
          <td className="weld-options">{showDeleted ? (canDelete && <button type="button" className="icon-btn" aria-label={`${WELD_BRING_BACK_WORDING.icon} ${str(weld.weldNo)}`} title={WELD_BRING_BACK_WORDING.icon} onClick={() => setRestoring(weld)}><RotateCcw size={16}/></button>) : <>
            {canOpen && <button type="button" className="icon-btn" aria-label={editLabel} title={readOnly ? editLabel : 'Edit weld'} onClick={() => setEditing(weld)}><Pencil size={16}/></button>}
            {canEdit && <button type="button" className={`icon-btn ${weld.stampedBy ? 'weld-stamp-set' : ''}`} aria-label={`Stamp weld ${str(weld.weldNo)}${stamper ? `, stamped by ${str(stamper.name)}` : ''}`} title={stamper ? stampOptionLabel(stamper) : 'Stamp'} onClick={() => setStamping(weld)}><Stamp size={16}/></button>}</>}</td>
          <td className="select-cell"><input type="checkbox" aria-label={`Check weld ${str(weld.weldNo)}`} disabled={lock.locked || showDeleted} title={lock.locked ? `Cannot be checked: ${lock.reason}` : undefined} checked={!lock.locked && !showDeleted && selected.includes(weld.id)} onChange={event => setSelected(current => event.target.checked ? [...current, weld.id] : current.filter(id => id !== weld.id))}/></td>
        </tr>;
      })}</tbody>
    </table></div>
      : showDeleted ? <EmptyState {...deletedViewEmpty(welds.length)}/>
      : <EmptyState title="No welds on this isometric" description="Add the first weld, or add a range of weld numbers at once with Options → Add welds." action={canAdd ? <button type="button" className="btn primary" onClick={() => setDialog('add')}><Plus size={16}/>Add weld</button> : undefined}/>}
    {dialog === 'add' && <WeldDialog iso={iso} data={data} onClose={() => setDialog(null)}/>}
    {dialog === 'range' && <RangeDialog iso={iso} data={data} onClose={() => setDialog(null)}/>}
    {editing && <WeldDialog iso={iso} weld={editing} data={data} lockedReason={editingLock?.locked ? editingLock.reason : undefined} onDeleted={canDelete ? () => setSelected(current => current.filter(id => id !== editing.id)) : undefined} onClose={() => setEditing(null)}/>}
    {stamping && <StampDialog weld={stamping} data={data} onClose={() => setStamping(null)}/>}
    {dialog === 'mass' && <MassEditDialog iso={iso} data={data} selected={checked} onClose={() => setDialog(null)} onDone={() => setSelected([])}/>}
    {dialog === 'delete' && <DeleteDialog welds={removing} onClose={() => setDialog(null)} onDone={() => setSelected([])}/>}
    {/* Options → Punch list opens the isometric's punch dialog (Add item / Complete punch & Sign-off), the same as the open count of the Progress & Status card. */}
    {dialog === 'punch' && <PunchDialog isoId={iso.id} onClose={() => setDialog(null)}/>}
    {restoring && <BringBackDialog weld={restoring} onClose={() => setRestoring(null)} onBack={() => { if (!stayInDeletedView(data.deleted.filter(row => row.id !== restoring.id).length)) setShowDeleted(false); }}/>}
    {inspection && <inspection.Dialog isoId={str(iso.id)} weldIds={checked.map(weld => weld.id)} onClose={() => setInspection(null)}/>}
  </section>;
  return <>{layout({ menu, addWeld, panel })}</>;
}

/**
 * The isometric page of Weld Core (client change list 22.11.2026): the LISL is the page's one register, with no tab strip and no
 * second all-fields view (the full-field Data LISL opens from Options). Its Options menu is the page's Options menu.
 */
export function WeldsPanel(props: WeldsPanelProps) {
  return <WeldTable key={props.iso.id} {...props}/>;
}
