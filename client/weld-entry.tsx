import { Fragment, useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { AlertCircle, ArrowDown, ArrowUp, ChevronDown, ChevronRight, GripVertical, ListPlus, Loader2, Lock, Pencil, Plus, RotateCcw, Stamp, Trash2 } from 'lucide-react';
import { useWorkspace, activeRows } from './context.tsx';
import { Dropdown, EmptyState, Modal, SearchInput, TableScroll, revealInvalidField } from './components.tsx';
import { availableWps } from './catalog.ts';
import { ApiError, api, post, formatDate } from './api.ts';
import { DataLisl } from './data-lisl.tsx';
import { InspectionCell } from './weld-inspection-cell.tsx';
import { AttachmentCountBadge } from './iso-dialogs.tsx';
import { useInspectionMenu, type InspectionMenuItem } from './inspections.tsx';
import { PunchDialog } from './punch.tsx';
import { projectCertificates, wpsValidation } from '../shared/site-settings.ts';
import { enabledOnSite, enabledOptions } from '../shared/weld-catalogs.ts';
import { SPOOL_NAMES, SPOOL_NAME_INPUT, spoolOptionsForIso } from '../shared/spool-catalog.ts';
import { resourceAvailable } from '../shared/release.ts';
import { NDT_ROUNDS, INSPECTION_MASS_EDIT_FIELDS, INSPECTION_WELD_FIELDS, ndtOrPwhtInProgress } from '../shared/inspections.ts';
import { nonWeldCode } from '../shared/weld-codes.ts';
import {
  WELDERS, diameterOptionValue, diameterOptions, certificateErrors, certificatesForProject, chargeSelection, chargeValue, dropWeld, lockContext, locationTooltip, missingMandatoryFields, moveWeld, neighbourOf, orderedWelds,
  planWeldRange, sideSummary, typeAbbreviation, weldDiameterText, weldLocation, weldLock, WELD_ENTRY_FIELDS, SIDE_VALUES,
  MASS_EDIT_CLEAR_LABEL, MASS_EDIT_COLUMNS, MASS_EDIT_DATES, MASS_EDIT_DATE_HINT, MASS_EDIT_DIAMETER, MASS_EDIT_FLAGS_LABELS, MASS_EDIT_SECTIONS, MASS_EDIT_SELECT_NOTHING,
  NO_WELDER_TEXT, STAMP_NONE, WELD_BRING_BACK_WORDING, deletedViewEmpty, stayInDeletedView, WELD_DELETE_WORDING, WELD_OPTIONS_MENU, WELD_ORDER_MESSAGES, WELD_SORTING_MESSAGES, orderFailureMessage, sideCellTexts, stampOptionLabel,
  MASS_EDIT_MANDATORY_MESSAGE, massEditMissingFields, readMassEdit, weldMatchesSearch, weldSortingDisabled, weldSortingMenu, welderStamps, type MassEditItem,
  CERTIFICATE_NOT_SELECTABLE, DIAMETER_MESSAGES, DUPLICATE_WELDER, EDIT_REASON_LABEL, EDIT_REASON_MAX, EDIT_REASON_WARNING, EDIT_TRACER_HINT, WELD_MANDATORY_MESSAGE, addNewEnabled, certificateSelectable, certificateSelectionErrors, chargeDetails,
  chargeOptionList, diameterErrors, diameterTextOrder, duplicateWelderErrors, editHistoryDate, editReason, newWeldDefaults, specialWeldCleared, specialWeldHidden, weldDiameterCheck, weldFormLayout, wireLabel, wpsLabel,
  RANGE_DIALOG, WELDER_PLACEHOLDER, chargeMaterialGroup, chargesForWelders, diameterRowSize, diameterSizeMm, groupWeldersForDia, materialGroupWarnings, suggestOnDia, welderFieldsDisabled, welderOptionList, weldersForWps, weldersQualifiedForDiameter,
  wpsChangeClearsWelders, wpsMatchesDiameter, rangeSkippedMessage, type SelectOption,
} from '../shared/weld-entry.ts';
import type { Row } from '../shared/types.ts';

type Values = Record<string, unknown>;
const str = (value: unknown) => String(value ?? '');
const FLAGS = ['ndoReqPre', 'ndoReq', 'pwhtReqPre', 'pwhtReq', 'repair'] as const;
const sortByName = (rows: Row[], key = 'name') => [...rows].sort((a, b) => str(a[key]).localeCompare(str(b[key]), 'en', { numeric: true }));

/** Everything the table, the form and the dialogs read for one isometric, derived once from the workspace rows. */
/** Dia. options: one per distinct Size in inches of the catalog in the hosted profile (see diameterOptions). */
function useDiameterOptions() { const { rows, user } = useWorkspace(); return useMemo(() => diameterOptions(activeRows(rows, 'diameters'), Boolean(user.availability?.features.includes('pilots'))), [rows, user]); }
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
/** The scope texts (EN Ø, ASME IX Ø) of the PQRs linked to a WPS: what its diameter match reads. */
function useWpsScopes() {
  const { rows } = useWorkspace();
  return useMemo(() => {
    const options = new Map((rows.qualification_options || []).map(row => [row.id, str(row.name)]));
    const pqr = new Map((rows.pqr || []).map(row => [row.id, row]));
    const scopes = new Map<string, string[]>();
    for (const link of rows.wps_pqr || []) {
      if (link._archived) continue;
      const row = pqr.get(str(link.pqrId)); if (!row) continue;
      const texts = [row.attribute15Id, row.attribute18Id].map(id => options.get(str(id)) || '').filter(Boolean);
      scopes.set(str(link.wpsId), [...(scopes.get(str(link.wpsId)) || []), ...texts]);
    }
    return scopes;
  }, [rows]);
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

/** Edit weld from the blockers list of the isometric page: read-only with the lock banner while the weld is locked. */
export function EditWeldDialog({ iso, weld, onClose }: { iso: Row; weld: Row; onClose: () => void }) {
  const data = useWeldData(iso), lock = weldLock(weld, data.lock);
  return <WeldDialog iso={iso} weld={weld} data={data} onClose={onClose} lockedReason={lock.locked ? lock.reason : undefined}/>;
}

export function WeldDialog({ iso, weld, data, onClose, lockedReason }: { iso: Row; weld?: Row; data: WeldData; onClose: () => void; lockedReason?: string }) {
  const { rows, refresh, notify } = useWorkspace();
  const mode = weld ? 'edit' : 'add';
  const [values, setValues] = useState<Values>(() => initialValues(weld, iso.id));
  const [updatePrev, setUpdatePrev] = useState(false), [updateNext, setUpdateNext] = useState(false);
  const [note, setNote] = useState(''), [defaultDiameter, setDefaultDiameter] = useState('');
  const [error, setError] = useState(''), [fields, setFields] = useState<Record<string, string>>({}), [busy, setBusy] = useState(false);
  const initialSpool = str(data.spools.get(str(weld?.spoolId))?.name), [spoolName, setSpoolName] = useState(initialSpool), spoolNames = useSpoolOptions(iso, data, initialSpool);
  const order = data.welds.map(row => row.id);
  const hasPrev = weld ? Boolean(neighbourOf(order, weld.id, 'prev')) : false, hasNext = weld ? Boolean(neighbourOf(order, weld.id, 'next')) : false;
  const set = (patch: Values) => setValues(current => ({ ...current, ...patch })); const set1 = (name: string) => (value: unknown) => set({ [name]: value });
  const explicit = values.lengthMode === 'Length in mm';
  const scopes = useWpsScopes();
  const diameterRow = data.diameters.get(str(values.diameterId)), diaSize = explicit ? '' : diameterRowSize(diameterRow), diaMm = explicit ? null : diameterSizeMm(diameterRow);
  const matchingWps = diaMm === null ? [] : activeRows(rows, 'wps').filter(row => row.id === values.wpsId || (row.active !== false && data.project && availableWps(rows, row, data.project.id))).filter(row => wpsMatchesDiameter(scopes.get(row.id) || [], diaMm)).map(row => row.id);
  // After Dia.: the WPS that match it move to the top.
  const wpsOptions = activeRows(rows, 'wps').filter(row => row.id === values.wpsId || (row.active !== false && data.project && availableWps(rows, row, data.project.id))).map(row => ({ value: row.id, label: wpsLabel(row), match: matchingWps.includes(row.id) })).sort((a, b) => Number(b.match) - Number(a.match));
  const selectedCharge = (side: 1 | 2) => data.certs.get(str(values[`certificate${side}Id`]));
  // Catalog records switched off on the active main project are left out, except the value the weld already stores.
  const enabled = (key: string, keep?: unknown) => enabledOptions(key, activeRows(rows, key), str(data.site?.id), rows, keep);
  const options = (key: string, label: (row: Row) => string, filter: (row: Row) => boolean = () => true, keep?: unknown) => sortByName(enabled(key, keep).filter(filter), 'name').map(row => ({ value: row.id, label: label(row) }));
  const nameOf = (row: Row) => str(row.name);
  const wireOf = (row: Row) => wireLabel(row, str(data.lookups.materialTypes.get(str(row.materialTypeId))?.name));
  const diameters = diameterTextOrder(useDiameterOptions());
  const welders = rows.welders || [];
  const welderCertificates = rows.welder_certificates as Row[] | undefined, chosenWps = data.wps.get(str(values.wpsId)), onDate = str(values.date) || todayText();
  // Add weld lists welders only once a WPS is chosen; Edit weld opens with the full list until then.
  const welderFor = (name: string) => mode === 'edit' && !chosenWps ? welders.filter(row => !row._archived && (row.status !== 'Inactive' || row.id === values[name])) : weldersForWps(data.site, welders, welderCertificates, chosenWps, onDate, [values[name]]);
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
  const reasonNeeded = Boolean(weld) && ndtOrPwhtInProgress(data.requests, str(weld?.id));
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
    const matches = mm === null ? [] : activeRows(rows, 'wps').filter(item => item.active !== false && data.project && availableWps(rows, item, data.project.id) && wpsMatchesDiameter(scopes.get(item.id) || [], mm)).map(item => item.id);
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
    Object.assign(found, duplicateWelderErrors(values), diameterErrors({ ...values, defaultDiameter }, { certificates: data.certs, diameters: data.diameters }));
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
  return <Modal title={weld ? 'Edit weld' : 'Add weld'} subtitle={`${str(iso.isoNo)}${weld ? ` · ${str(weld.weldNo)}` : ''}`} wide onClose={onClose}>
    <form onInvalidCapture={revealInvalidField} onSubmit={event => void submit(event)} noValidate>
      <div className="modal-body weld-form">
        {lockedReason && <div className="alert iso-lock-banner" role="status"><Lock size={16} aria-hidden="true"/><span><strong>{lockedReason}</strong> Weld {str(weld?.weldNo)} is read-only.</span></div>}
        {weld && <PreviousEdits weldId={weld.id}/>}
        {reasonNeeded && !lockedReason && <div className="weld-reason">
          <div className="alert weld-warning" role="note"><AlertCircle size={18}/><span><strong>Warning</strong><br/>{EDIT_REASON_WARNING}</span></div>
          <div className="field"><label htmlFor="weld-edit-reason">{EDIT_REASON_LABEL}</label><textarea id="weld-edit-reason" required maxLength={EDIT_REASON_MAX} rows={3} value={note} placeholder={EDIT_REASON_LABEL} aria-invalid={Boolean(e.note)} aria-describedby={e.note ? 'weld-edit-reason-error' : undefined} onChange={event => setNote(event.target.value)}/>{e.note && <small id="weld-edit-reason-error" className="field-error">{e.note}</small>}</div>
        </div>}
        <Failure message={error}/>
        <fieldset className="weld-form-fields" disabled={Boolean(lockedReason)}>
        <div className="weld-form-columns">{layout.map((column, index) => <div key={index} className={`weld-form-column weld-form-column-${index + 1}`}>{column.map(item => <Fragment key={item.name}>{columns[item.name]}</Fragment>)}</div>)}</div>
        </fieldset>
        {blocked && <p className="weld-blocked muted" role="status">{WELD_MANDATORY_MESSAGE}</p>}
        <MaterialWarnings warnings={warnings}/>
      </div>
      <div className="modal-footer">
        <button type="button" className="btn" disabled={busy} onClick={onClose}>{lockedReason ? 'Close' : 'Cancel'}</button>
        {weld && !lockedReason && <button type="button" className="btn" disabled={saveBlocked || !addNew} title={addNew ? undefined : 'Change Weld no. to a number this isometric does not have yet.'} onClick={event => void submit(event as unknown as FormEvent, true)}>Add new</button>}
        {!lockedReason && <button className="btn primary" disabled={saveBlocked}>{busy && <Loader2 size={15} className="spin"/>}{weld ? 'Update' : 'Add'}</button>}
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
  const diameters = diameterTextOrder(useDiameterOptions());
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
  const set = (name: string) => (value: unknown) => setChanges(current => { const next = { ...current }; if (value === '' || value === undefined) delete next[name]; else next[name] = value; return next; });
  // Mass edit sets new values only, so catalog records switched off on the active main project are not offered.
  const options = (key: string, label: (row: Row) => string = row => str(row.name)) => sortByName(enabledOptions(key, activeRows(rows, key), str(data.site?.id), rows), 'name').map(row => ({ value: row.id, label: label(row) }));
  const diameters = useDiameterOptions();
  // Mass edit shows the WPS as "process | number (designation)" (reference, wpsLabel 'mass').
  const wpsOptions = activeRows(rows, 'wps').filter(row => row.active !== false && data.project && availableWps(rows, row, data.project.id)).map(row => ({ value: row.id, label: wpsLabel(row, 'mass') }));
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
      const chosen = data.wps.get(str(changes.wpsId)), list = welderOptionList(chosen ? weldersForWps(data.site, rows.welders || [], rows.welder_certificates as Row[] | undefined, chosen, todayText()) : (rows.welders || []).filter(row => !row._archived && row.status !== 'Inactive'), 'mass');
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
    setBusy(true);
    try { await post('/actions/mass-edit-welds', { weldIds: selected.map(row => row.id), versions: Object.fromEntries(selected.map(row => [row.id, row._version])), changes: body }); await refresh(); notify(`${selected.length} ${selected.length === 1 ? 'weld' : 'welds'} updated.`); onDone(); onClose(); }
    catch (failure) { setError(errorMessage(failure)); setFields((failure as ApiError).fields || {}); } finally { setBusy(false); }
  }
  const e = fields;
  return <Modal title="Mass edit welds" subtitle={`${str(iso.isoNo)} · ${selected.length} checked ${selected.length === 1 ? 'weld' : 'welds'}`} wide onClose={onClose}>
    <form onInvalidCapture={revealInvalidField} onSubmit={event => void submit(event)} noValidate><div className="modal-body weld-form">
      <Failure message={error}/>
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

const COLUMNS = ['Sort', 'WN', 'Type', 'Wdr', 'VI', 'NDT (Pre)', 'NDT', 'Pre-HT/PWHT', 'Idx', 'Chg.No.', 'Material ①', 'Idx', 'Chg.No.', 'Material ②', 'WPS', 'D', 'S', 'Options'];

function WeldTable({ iso, onAttachments, onAuditTrail, onSetPhase, canSetPhase, canAttachments, switcher }: { iso: Row; onAttachments: () => void; onAuditTrail: () => void; onSetPhase: () => void; canSetPhase: boolean; canAttachments: boolean; switcher: ReactNode }) {
  const { canRecord, canRun, refresh, notify } = useWorkspace(); const data = useWeldData(iso);
  const [selected, setSelected] = useState<string[]>([]), [query, setQuery] = useState(''), [showDeleted, setShowDeleted] = useState(false);
  const [dialog, setDialog] = useState<'add' | 'range' | 'mass' | 'delete' | 'punch' | null>(null), [editing, setEditing] = useState<Row | null>(null), [stamping, setStamping] = useState<Row | null>(null), [removing, setRemoving] = useState<Row[]>([]), [restoring, setRestoring] = useState<Row | null>(null);
  const [dragging, setDragging] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [announce, setAnnounce] = useState('');
  // NDT / visual inspection / PWHT entries of the inspections flow (already filtered by permission and the 'inspections' feature).
  const inspectionMenu = useInspectionMenu(str(iso.id)), [inspection, setInspection] = useState<InspectionMenuItem | null>(null);
  const { welds } = data, order = welds.map(weld => weld.id);
  const sortingOff = weldSortingDisabled(iso), sorting = weldSortingMenu(sortingOff);
  const locks = new Map([...welds, ...data.deleted].map(weld => [weld.id, weldLock(weld, data.lock)]));
  const sideOf = (weld: Row, side: 1 | 2) => {
    const certificate = data.certs.get(str(weld[`certificate${side}Id`])), material = data.materials.get(str(weld[`material${side}Id`] || certificate?.materialId));
    return sideSummary(weld, side, { certificate, material, materialType: str(data.materialTypes.get(str(material?.typeId))?.name), materialPart: str(data.materialParts.get(str(material?.partId))?.name) });
  };
  const weldersOf = (weld: Row) => WELDERS.map(name => data.welders.get(str(weld[name]))).filter((row): row is Row => Boolean(row));
  /** The text the Search box looks through: what the row prints (and the tooltips behind it). */
  const rowText = (weld: Row) => {
    const type = data.types.get(str(weld.typeId)), cells = [1, 2].map(side => { const text = sideCellTexts(sideOf(weld, side as 1 | 2)); return `${text.index} ${text.charge} ${text.material}`; });
    return [weld.weldNo, typeAbbreviation(type), type?.name, ...weldersOf(weld).flatMap(row => [row.welderCode || row.number, row.name]), ...cells, data.wps.get(str(weld.wpsId))?.name, weldDiameterText(weld, data.diameters.get(str(weld.diameterId))), data.spools.get(str(weld.spoolId))?.name].map(str).join(' ');
  };
  const listed = showDeleted ? data.deleted : welds;
  const visible = listed.filter(weld => weldMatchesSearch(rowText(weld), query));
  const checked = showDeleted ? [] : visible.filter(weld => selected.includes(weld.id) && !locks.get(weld.id)!.locked);
  const unlocked = showDeleted ? [] : visible.filter(weld => !locks.get(weld.id)!.locked);
  const canAdd = canRun('save-weld', {}), canEdit = canRun('save-weld', { weldId: 'x' }), canMass = canRun('mass-edit-welds'), canDelete = canRecord('welds', 'delete');
  const showSort = !sortingOff && !showDeleted, canSort = canRun('reorder-welds') && showSort;
  const columns = showSort ? COLUMNS : COLUMNS.slice(1);
  async function toggleSorting() {
    try { await post('/actions/toggle-weld-sorting', { isoId: iso.id, enabled: sortingOff }); await refresh(); notify(sortingOff ? WELD_SORTING_MESSAGES.enabled : WELD_SORTING_MESSAGES.disabled); }
    catch { setError(WELD_SORTING_MESSAGES.failed); }
  }
  async function toggleDeleted() { setShowDeleted(value => !value); setSelected([]); setQuery(''); try { await refresh(); } catch { /* the workspace shows its own connection error */ } }
  async function reorder(next: string[] | null, moved?: Row, direction?: 'up' | 'down') {
    if (!next || busy) return; setBusy(true); setError('');
    try { await post('/actions/reorder-welds', { isoId: iso.id, weldIds: next }); await refresh(); notify(WELD_ORDER_MESSAGES.saved); if (moved) setAnnounce(`Weld ${str(moved.weldNo)} moved to place ${next.indexOf(moved.id) + 1} of ${next.length}.`); }
    catch (failure) { setError(orderFailureMessage(failure)); try { await refresh(); } catch { /* the saved order could not be reloaded either */ } } finally { setBusy(false); setDragging(''); }
    // The arrow buttons are disabled while saving, which drops keyboard focus: give it back to the moved weld (the other arrow once it reached an end).
    if (moved && direction) requestAnimationFrame(() => {
      const button = (dir: 'up' | 'down') => document.querySelector<HTMLButtonElement>(`button[aria-label="${CSS.escape(`Move weld ${str(moved.weldNo)} ${dir}`)}"]`);
      const target = [button(direction), button(direction === 'up' ? 'down' : 'up')].find(candidate => candidate && !candidate.disabled);
      target?.focus();
    });
  }
  const sideCells = (weld: Row, side: 1 | 2) => {
    const summary = sideOf(weld, side), text = sideCellTexts(summary);
    return <><td className="tabular">{text.index}</td><td className="tabular">{text.charge}</td><td className={`weld-material ${summary.kind}`}>{text.material}</td></>;
  };
  if (!canRecord('welds')) return <EmptyState title="Weld register restricted" description="Your permission profile does not include the weld register."/>;
  const inspectionItem = (key: string) => inspectionMenu.find(item => item.key === key);
  const menuItem = (key: string, label: string): ReactNode => {
    switch (key) {
      case 'attachments': return <button type="button" disabled={!canAttachments} onClick={onAttachments}>{label}<AttachmentCountBadge isoId={iso.id}/></button>;
      case 'punch-list': return canRecord('punchlists') ? <button type="button" onClick={() => setDialog('punch')}>{label}</button> : null;
      case 'audit-trail': return <button type="button" onClick={onAuditTrail}>{label}</button>;
      case 'set-phase': return <button type="button" disabled={!canSetPhase} onClick={onSetPhase}>{label}</button>;
      case 'show-deleted': return <button type="button" onClick={() => void toggleDeleted()}>{showDeleted ? WELD_BRING_BACK_WORDING.showActive : label}</button>;
      case 'delete-selected': return <button type="button" disabled={!canDelete || !checked.length} onClick={() => { setRemoving(checked); setDialog('delete'); }}>{label}</button>;
      case 'sorting': return <button type="button" role="menuitemcheckbox" aria-checked={sorting.checked} onClick={() => void toggleSorting()}>{sorting.checked ? '☑' : '☐'} {sorting.label}</button>;
      default: {
        const item = inspectionItem(key); if (!item) return null;
        const count = key === 'visual-inspection' ? /\s\((\d+)\)$/.exec(item.label)?.[1] : undefined;
        return <button type="button" onClick={() => setInspection(item)}>{label}{count !== undefined && <span className="count-pill">{count}</span>}</button>;
      }
    }
  };
  return <section className="panel weld-panel" aria-label="Welds">
    <div className="panel-heading weld-panel-heading"><div><h2>Welds</h2><span className="muted">{showDeleted ? `${data.deleted.length} deleted on this isometric` : `${welds.length} on this isometric`}</span></div>{switcher}
      <div className="heading-actions weld-actions">
        <Dropdown label="Options" trigger={<span className="btn">Options<ChevronDown size={15}/></span>}>
          {WELD_OPTIONS_MENU.map(entry => { const node = menuItem(entry.key, entry.label); return node ? <Fragment key={entry.key}>{entry.dividerBefore && <div role="separator" className="dropdown-divider"/>}{node}</Fragment> : null; })}
        </Dropdown>
        <button type="button" className="btn" disabled={!canMass || showDeleted} onClick={() => { if (checked.length) setDialog('mass'); else notify(MASS_EDIT_SELECT_NOTHING); }}>Mass edit welds</button>
        <button type="button" className="btn" disabled={!canRun('add-welds') || showDeleted} onClick={() => setDialog('range')}><ListPlus size={16}/>{RANGE_DIALOG.toolbar}</button>
        <button type="button" className="btn primary" disabled={!canAdd || showDeleted} onClick={() => setDialog('add')}><Plus size={16}/>Add weld</button>
      </div></div>
    <Failure message={error}/>
    <p className="sr-only" role="status" aria-live="polite">{announce}</p>
    {listed.length > 0 && <div className="weld-search"><SearchInput value={query} onChange={setQuery} placeholder="Search"/></div>}
    {listed.length ? <TableScroll><table className="data-table weld-table" aria-label={`${showDeleted ? 'Deleted welds' : 'Welds'} of ${str(iso.isoNo)}`} aria-busy={busy}>
      <thead><tr>{columns.map((name, index) => <th key={`${name}${index}`} scope="col" className={name === 'Sort' ? 'weld-sort-head' : undefined}>{name === 'Sort' ? <span className="sr-only">Sort</span> : name}</th>)}<th scope="col" className="select-cell"><input type="checkbox" aria-label="Check all unlocked welds" disabled={showDeleted} checked={unlocked.length > 0 && unlocked.every(weld => selected.includes(weld.id))} ref={input => { if (input) input.indeterminate = unlocked.some(weld => selected.includes(weld.id)) && !unlocked.every(weld => selected.includes(weld.id)); }} onChange={event => setSelected(current => event.target.checked ? [...new Set([...current, ...unlocked.map(weld => weld.id)])] : current.filter(id => !unlocked.some(weld => weld.id === id)))}/></th></tr></thead>
      <tbody>{visible.map(weld => {
        const lock = locks.get(weld.id)!, type = data.types.get(str(weld.typeId)), stamps = welderStamps(weldersOf(weld)), stamper = data.stampers.get(str(weld.stampedBy));
        const abbreviation = typeAbbreviation(type), tooltip = locationTooltip(type);
        return <tr key={weld.id} className={`${lock.locked ? 'weld-row-locked' : ''} ${dragging === weld.id ? 'weld-row-dragging' : ''}`} onDragOver={event => { if (dragging && dragging !== weld.id) event.preventDefault(); }} onDrop={event => { event.preventDefault(); void reorder(dropWeld(order, dragging, weld.id), welds.find(row => row.id === dragging)); }}>
          {showSort && <td className="weld-sort-cell">{canSort ? <><span className="weld-grip" draggable aria-hidden="true" title="Drag to reorder" onDragStart={event => { event.dataTransfer.setData('text/plain', weld.id); event.dataTransfer.effectAllowed = 'move'; setDragging(weld.id); }} onDragEnd={() => setDragging('')}><GripVertical size={16}/></span><button type="button" className="icon-btn" aria-label={`Move weld ${str(weld.weldNo)} up`} disabled={busy || order[0] === weld.id} onClick={() => void reorder(moveWeld(order, weld.id, 'up'), weld, 'up')}><ArrowUp size={14}/></button><button type="button" className="icon-btn" aria-label={`Move weld ${str(weld.weldNo)} down`} disabled={busy || order.at(-1) === weld.id} onClick={() => void reorder(moveWeld(order, weld.id, 'down'), weld, 'down')}><ArrowDown size={14}/></button></> : <span className="muted">-</span>}</td>}
          <td className="weld-no">{canEdit && !lock.locked && !showDeleted ? <button type="button" className="record-link" onClick={() => setEditing(weld)}>{str(weld.weldNo)}</button> : str(weld.weldNo)}</td>
          <td>{abbreviation ? <span className="weld-type" tabIndex={0} title={tooltip} aria-label={`${abbreviation}, ${tooltip}`}>{abbreviation}</span> : <span className="muted">-</span>}</td>
          <td>{stamps.length ? stamps.map((stamp, index) => <span key={index} title={stamp.name}>{index ? ', ' : ''}{stamp.code}</span>) : <span className="muted">{NO_WELDER_TEXT}</span>}</td>
          <td><InspectionCell weld={weld} kind="VI"/></td><td><InspectionCell weld={weld} kind="NDT PRE"/></td><td><InspectionCell weld={weld} kind="NDT"/></td><td><InspectionCell weld={weld} kind="PWHT"/></td>
          {sideCells(weld, 1)}{sideCells(weld, 2)}
          <td>{str(data.wps.get(str(weld.wpsId))?.name) || <span className="muted">—</span>}</td>
          <td className="tabular">{weldDiameterText(weld, data.diameters.get(str(weld.diameterId))) || <span className="muted">—</span>}</td>
          <td>{str(data.spools.get(str(weld.spoolId))?.name) || <span className="muted">—</span>}</td>
          <td className="weld-options">{lock.locked ? <span className="weld-lock" role="img" aria-label={`Locked. ${lock.reason}`} title={lock.reason}><Lock size={16}/></span> : showDeleted ? (canDelete && <button type="button" className="icon-btn" aria-label={`${WELD_BRING_BACK_WORDING.icon} ${str(weld.weldNo)}`} title={WELD_BRING_BACK_WORDING.icon} onClick={() => setRestoring(weld)}><RotateCcw size={16}/></button>) : <>
            {canEdit && <button type="button" className="icon-btn" aria-label={`Edit weld ${str(weld.weldNo)}`} onClick={() => setEditing(weld)}><Pencil size={16}/></button>}
            {canDelete && <button type="button" className="icon-btn" aria-label={`Delete weld ${str(weld.weldNo)}`} onClick={() => { setRemoving([weld]); setDialog('delete'); }}><Trash2 size={16}/></button>}
            {canEdit && <button type="button" className={`icon-btn ${weld.stampedBy ? 'weld-stamp-set' : ''}`} aria-label={`Stamp weld ${str(weld.weldNo)}${stamper ? `, stamped by ${str(stamper.name)}` : ''}`} title={stamper ? stampOptionLabel(stamper) : 'Stamp'} onClick={() => setStamping(weld)}><Stamp size={16}/></button>}</>}</td>
          <td className="select-cell"><input type="checkbox" aria-label={`Check weld ${str(weld.weldNo)}`} disabled={lock.locked || showDeleted} title={lock.locked ? lock.reason : undefined} checked={!lock.locked && !showDeleted && selected.includes(weld.id)} onChange={event => setSelected(current => event.target.checked ? [...current, weld.id] : current.filter(id => id !== weld.id))}/></td>
        </tr>;
      })}</tbody>
      {canSort && dragging && <tfoot><tr className="weld-drop-end" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); void reorder(dropWeld(order, dragging, null), welds.find(row => row.id === dragging)); }}><td colSpan={columns.length + 1}>Drop here to move the weld to the end</td></tr></tfoot>}
    </table>{visible.length === 0 && <p className="muted weld-no-match" role="status">No weld matches “{query.trim()}”.</p>}</TableScroll>
      : showDeleted ? <EmptyState {...deletedViewEmpty(welds.length)}/>
      : <EmptyState title="No welds on this isometric" description="Add the first weld, or add a range of weld numbers at once." action={canAdd ? <button type="button" className="btn primary" onClick={() => setDialog('add')}><Plus size={16}/>Add weld</button> : undefined}/>}
    {welds.length > 0 && !showDeleted && <p className="muted weld-legend"><Lock size={13}/> A padlock marks a weld of a completed phase: field welds after the Field release, shop welds after the Prefab release. Reopen the release to change them.</p>}
    {dialog === 'add' && <WeldDialog iso={iso} data={data} onClose={() => setDialog(null)}/>}
    {dialog === 'range' && <RangeDialog iso={iso} data={data} onClose={() => setDialog(null)}/>}
    {editing && <WeldDialog iso={iso} weld={editing} data={data} onClose={() => setEditing(null)}/>}
    {stamping && <StampDialog weld={stamping} data={data} onClose={() => setStamping(null)}/>}
    {dialog === 'mass' && <MassEditDialog iso={iso} data={data} selected={checked} onClose={() => setDialog(null)} onDone={() => setSelected([])}/>}
    {dialog === 'delete' && <DeleteDialog welds={removing} onClose={() => setDialog(null)} onDone={() => setSelected([])}/>}
    {/* Options → Punch list opens the isometric's punch dialog (Add item / Complete punch & Sign-off), the same as the Item button of the status card. */}
    {dialog === 'punch' && <PunchDialog isoId={iso.id} onClose={() => setDialog(null)}/>}
    {restoring && <BringBackDialog weld={restoring} onClose={() => setRestoring(null)} onBack={() => { if (!stayInDeletedView(data.deleted.filter(row => row.id !== restoring.id).length)) setShowDeleted(false); }}/>}
    {inspection && <inspection.Dialog isoId={str(iso.id)} weldIds={checked.map(weld => weld.id)} onClose={() => setInspection(null)}/>}
  </section>;
}

/** The Welds tab of the isometric in Weld Pilot: the reference weld table by default and the LISL register as a second view. */
export function WeldsPanel(props: { iso: Row; onAttachments: () => void; onAuditTrail: () => void; onSetPhase: () => void; canSetPhase: boolean; canAttachments: boolean }) {
  const { canReadReport } = useWorkspace(); const [view, setView] = useState<'welds' | 'lisl'>('welds');
  const lisl = canReadReport('lisl');
  const switcher = lisl ? <div className="table-tabs weld-views" role="group" aria-label="Weld view"><button type="button" className={view === 'welds' ? 'selected' : ''} aria-pressed={view === 'welds'} onClick={() => setView('welds')}>Welds</button><button type="button" className={view === 'lisl' ? 'selected' : ''} aria-pressed={view === 'lisl'} onClick={() => setView('lisl')}>LISL (all fields)</button></div> : null;
  if (view === 'lisl' && lisl) return <><div className="weld-views-bar">{switcher}</div><DataLisl key={props.iso.id} scopeIsoId={props.iso.id} scopeProjectId={String(props.iso.projectId)} embedded/></>;
  return <WeldTable {...props} switcher={switcher}/>;
}
