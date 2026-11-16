import { Fragment, useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { AlertCircle, ArrowDown, ArrowUp, ChevronDown, GripVertical, ListPlus, Loader2, Lock, Pencil, Plus, RotateCcw, Stamp, Trash2 } from 'lucide-react';
import { useWorkspace, activeRows } from './context.tsx';
import { Dropdown, EmptyState, Modal, SearchInput, TableScroll, revealInvalidField } from './components.tsx';
import { availableWps } from './catalog.ts';
import { ApiError, post } from './api.ts';
import { DataLisl } from './data-lisl.tsx';
import { InspectionCell } from './weld-inspection-cell.tsx';
import { useInspectionMenu, type InspectionMenuItem } from './inspections.tsx';
import { IsoPunchDialog } from './punch.tsx';
import { projectCertificates } from '../shared/site-settings.ts';
import { enabledOptions } from '../shared/weld-catalogs.ts';
import { NDT_ROUNDS } from '../shared/inspections.ts';
import {
  WELDERS, diameterOptionValue, diameterOptions, certificateErrors, certificatesForProject, chargeSelection, chargeValue, dropWeld, lockContext, locationTooltip, missingMandatoryFields, moveWeld, neighbourOf, orderedWelds,
  planWeldRange, sideSummary, typeAbbreviation, weldDiameterText, weldLock, WELD_ENTRY_FIELDS, SIDE_VALUES,
  MASS_EDIT_CLEAR_LABEL, MASS_EDIT_COLUMNS, MASS_EDIT_DATES, MASS_EDIT_DATE_HINT, MASS_EDIT_DIAMETER, MASS_EDIT_FLAGS_LABELS, MASS_EDIT_SECTIONS, MASS_EDIT_SELECT_NOTHING,
  NO_WELDER_TEXT, STAMP_NONE, WELD_BRING_BACK_WORDING, WELD_DELETE_WORDING, WELD_OPTIONS_MENU, WELD_ORDER_MESSAGES, WELD_SORTING_MESSAGES, orderFailureMessage, sideCellTexts, stampOptionLabel,
  MASS_EDIT_MANDATORY_MESSAGE, massEditMissingFields, readMassEdit, weldMatchesSearch, weldSortingDisabled, weldSortingMenu, welderStamps, type MassEditItem,
} from '../shared/weld-entry.ts';
import type { Row } from '../shared/types.ts';

type Values = Record<string, unknown>;
const str = (value: unknown) => String(value ?? '');
const FLAGS = ['ndoReqPre', 'ndoReq', 'pwhtReqPre', 'pwhtReq', 'repair'] as const;
const FLAG_LABELS: Record<string, string> = { ndoReqPre: 'NDT Req. Pre', ndoReq: 'NDT Req.', pwhtReqPre: 'Pre-HT', pwhtReq: 'PWHT Req.', repair: 'Repair' };
const sortByName = (rows: Row[], key = 'name') => [...rows].sort((a, b) => str(a[key]).localeCompare(str(b[key]), 'en', { numeric: true }));
const welderLabel = (welder: Row) => `${str(welder.welderCode || welder.number)}${welder.name ? `, ${str(welder.name)}` : ''}`;

/** Everything the table, the form and the dialogs read for one isometric, derived once from the workspace rows. */
/** Dia. options: one per distinct Size in inches of the catalog in the hosted profile (see diameterOptions). */
function useDiameterOptions() { const { rows, user } = useWorkspace(); return useMemo(() => diameterOptions(activeRows(rows, 'diameters'), Boolean(user.availability?.features.includes('pilots'))), [rows, user]); }
function useWeldData(iso: Row) {
  const { rows, allRows } = useWorkspace();
  return useMemo(() => {
    const all = (rows.welds || []).filter(weld => weld.isoId === iso.id);
    const welds = orderedWelds(all.filter(weld => !weld._archived), weldSortingDisabled(iso));
    const project = rows.projects?.find(row => row.id === iso.projectId);
    const site = rows.sites?.find(row => row.id === project?.siteId) ?? allRows.sites?.find(row => row.id === project?.siteId);
    const byId = (key: string) => new Map((rows[key] || []).map(row => [row.id, row]));
    const certificates = rows.certifications || [];
    const offered = project && projectCertificates(site) ? certificatesForProject(certificates, project.id, { links: rows.certificate_projects || [] }) : activeRows(rows, 'certifications');
    return {
      all, welds, deleted: orderedWelds(all.filter(weld => weld._archived), true), project, site, certificates, offered,
      lock: lockContext(rows.weld_types, rows.releases, rows.isometrics),
      types: byId('weld_types'), stampers: byId('qa_engineers'), welders: byId('welders'), wps: byId('wps'), diameters: byId('diameters'), spools: byId('spools'), certs: byId('certifications'), materials: byId('materials'), materialTypes: byId('material_types'), materialParts: byId('material_parts'),
    };
  }, [rows, allRows, iso]);
}
type WeldData = ReturnType<typeof useWeldData>;

// --------------------------------------------------------------------------------------------------- small controls

function Labelled({ label, error, hint, children, className = '', htmlFor, extra }: { label: string; error?: string; hint?: string; children: ReactNode; className?: string; htmlFor: string; extra?: string }) {
  return <div className={`field ${className}`}><label htmlFor={htmlFor}>{label}{extra && <span className="sr-only"> ({extra})</span>}</label>{children}{hint && <small className="field-hint">{hint}</small>}{error && <small id={`${htmlFor}-error`} className="field-error">{error}</small>}</div>;
}
function TextField({ label, value, onChange, error, type = 'text', required, readOnly, hint, min, max }: { label: string; value: unknown; onChange?: (value: string) => void; error?: string; type?: 'text' | 'date' | 'number'; required?: boolean; readOnly?: boolean; hint?: string; min?: number; max?: number }) {
  const id = `weld-${useId().replaceAll(':', '')}`;
  return <Labelled label={required ? `${label} *` : label} error={error} hint={hint} htmlFor={id}><input id={id} type={type} value={str(value)} required={required} readOnly={readOnly} min={min} max={max} step={type === 'number' ? 'any' : undefined} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} autoComplete="off" onChange={event => onChange?.(event.target.value)}/></Labelled>;
}
function SelectField({ label, value, onChange, error, options, placeholder = 'Select', disabled, hint, className, extra }: { label: string; value: unknown; onChange: (value: string) => void; error?: string; options: { value: string; label: string }[]; placeholder?: string; disabled?: boolean; hint?: string; className?: string; extra?: string }) {
  const id = `weld-${useId().replaceAll(':', '')}`;
  return <Labelled label={label} error={error} hint={hint} htmlFor={id} className={className} extra={extra}><div className="select-wrap"><select id={id} value={str(value)} disabled={disabled} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} onChange={event => onChange(event.target.value)}><option value="">{placeholder}</option>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select><ChevronDown size={14}/></div></Labelled>;
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

/** The options a charge number offers: nothing new, EXISTING, CONN ISO, then the project's certificates. */
function chargeOptions(data: WeldData, selected: string) {
  const list = [...data.offered];
  const current = data.certs.get(selected); if (current && !list.some(row => row.id === current.id)) list.push(current);
  return [...SIDE_VALUES.map(value => ({ value: value as string, label: value as string })), ...list.map(row => ({ value: row.id, label: [str(row.chargeNo || row.name), row.indexNo ? `index ${str(row.indexNo)}` : '', str(row.materialDescription || '')].filter(Boolean).join(' · ') }))];
}
const welderOptions = (welders: Row[], keep: unknown[]) => sortByName(welders.filter(row => !row._archived && (row.status !== 'Inactive' || keep.includes(row.id))), 'number').map(row => ({ value: row.id, label: welderLabel(row) }));

// --------------------------------------------------------------------------------------------------- add / edit weld

const ENTRY_FLAGS: Values = Object.fromEntries(FLAGS.map(name => [name, false]));
function initialValues(weld: Row | undefined, isoId: string): Values {
  const values: Values = { lengthMode: 'Diameter', ...ENTRY_FLAGS };
  if (weld) for (const name of WELD_ENTRY_FIELDS) values[name] = (FLAGS as readonly string[]).includes(name) ? Boolean(weld[name]) : weld[name] || (name === 'lengthMode' ? 'Diameter' : weld[name] ?? '');
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

export function WeldDialog({ iso, weld, data, onClose }: { iso: Row; weld?: Row; data: WeldData; onClose: () => void }) {
  const { rows, refresh, notify } = useWorkspace();
  const [values, setValues] = useState<Values>(() => initialValues(weld, iso.id));
  const [multiple, setMultiple] = useState(() => Boolean(weld && WELDERS.slice(1).some(name => weld[name])));
  const [updatePrev, setUpdatePrev] = useState(false), [updateNext, setUpdateNext] = useState(false);
  const [error, setError] = useState(''), [fields, setFields] = useState<Record<string, string>>({}), [busy, setBusy] = useState(false);
  const [range, setRange] = useState(false);
  const order = data.welds.map(row => row.id);
  const hasPrev = weld ? Boolean(neighbourOf(order, weld.id, 'prev')) : order.length > 0, hasNext = weld ? Boolean(neighbourOf(order, weld.id, 'next')) : false;
  const set = (patch: Values) => setValues(current => ({ ...current, ...patch })); const set1 = (name: string) => (value: unknown) => set({ [name]: value });
  const explicit = values.lengthMode === 'Length in mm';
  const wpsOptions = activeRows(rows, 'wps').filter(row => row.id === values.wpsId || (row.active !== false && data.project && availableWps(rows, row, data.project.id))).map(row => ({ value: row.id, label: str(row.name) }));
  const selectedCharge = (side: 1 | 2) => data.certs.get(str(values[`certificate${side}Id`]));
  // Catalog records switched off on the active main project are left out, except the value the weld already stores.
  const enabled = (key: string, keep?: unknown) => enabledOptions(key, activeRows(rows, key), str(data.site?.id), rows, keep);
  const options = (key: string, label: (row: Row) => string, filter: (row: Row) => boolean = () => true, keep?: unknown) => sortByName(enabled(key, keep).filter(filter), 'name').map(row => ({ value: row.id, label: label(row) }));
  const nameOf = (row: Row) => str(row.name);
  const diameters = useDiameterOptions();
  const welders = rows.welders || [];

  function precheck() {
    const found: Record<string, string> = {};
    if (!str(values.weldNo).trim()) found.weldNo = 'Weld no. is required.';
    if (explicit && values.dialen !== '' && !(Number(values.dialen) > 0)) found.dialen = 'Length in mm must be above zero.';
    if (explicit && values.ndoReq && values.ndtpercent !== '' && !(Number(values.ndtpercent) >= 0 && Number(values.ndtpercent) <= 100)) found.ndtpercent = 'NDT percent must be between 0 and 100.';
    Object.assign(found, missingMandatoryFields(data.site, values));
    for (const side of [1, 2]) if (!weld || str(weld[`certificate${side}Id`]) !== str(values[`certificate${side}Id`])) Object.assign(found, certificateErrors(data.site, values, str(values[`certificate${side}Id`]) ? [side] : [], data.certificates, str(data.project?.id), { links: rows.certificate_projects || [] }));
    return found;
  }
  async function submit(event: FormEvent, asNew = false) {
    event.preventDefault(); setError(''); setFields({});
    const found = precheck(); if (Object.keys(found).length) { setError(Object.values(found).length === 1 ? Object.values(found)[0] : 'Please check the highlighted fields.'); setFields(found); return; }
    const target = asNew ? undefined : weld, editing = Boolean(target);
    const payload: Values = { ...weldPayload(values, target), isoId: iso.id, ...(target ? { weldId: target.id, expectedVersion: target._version } : {}), ...(updatePrev && hasPrev ? { updatePrev: true } : {}), ...(updateNext && hasNext && editing ? { updateNext: true } : {}) };
    if (target && Object.keys(payload).length <= 3 && !payload.updatePrev && !payload.updateNext) { notify('Nothing changed.'); onClose(); return; }
    setBusy(true);
    try { await post('/actions/save-weld', payload); await refresh(); notify(`Weld ${str(values.weldNo)} ${editing ? 'updated' : 'added'}.`); onClose(); }
    catch (failure) { setError(errorMessage(failure)); setFields((failure as ApiError).fields || {}); } finally { setBusy(false); }
  }
  const e = fields;
  const section = (title: string, children: ReactNode, open = false) => <details className="form-section" open={open || Object.keys(e).length > 0}><summary>{title}</summary><div className="form-grid">{children}</div></details>;
  function charge(side: 1 | 2) {
    const certificate = selectedCharge(side), other = side === 1 ? 'prev' : 'next';
    return <>
      <SelectField label={`Charge number ${side}`} value={chargeValue(values, side)} options={chargeOptions(data, str(values[`certificate${side}Id`]))} error={e[`chargeNo${side}`] || e[`certificate${side}Id`]} placeholder="Select a charge" hint={projectCertificates(data.site) ? 'Only certificates linked to this project are offered.' : undefined} onChange={value => set(chargeSelection(value, side, data.certificates))}/>
      <CheckField label={other === 'prev' ? 'Upd. prev. weld' : 'Upd. next weld'} checked={side === 1 ? updatePrev : updateNext} disabled={side === 1 ? !hasPrev : !hasNext || !weld} hint={`Copies this charge to the adjoining side of the ${other === 'prev' ? 'previous' : 'next'} weld in table order.`} onChange={side === 1 ? setUpdatePrev : setUpdateNext}/>
      <TextField label="Index number" value={certificate?.indexNo} readOnly/><TextField label="Material" value={certificate?.materialCode} readOnly/><TextField label="Description" value={certificate?.materialDescription} readOnly/><TextField label="Diameter" value={certificate?.diameter} readOnly/>
    </>;
  }
  if (range) return <RangeDialog iso={iso} data={data} onClose={onClose} onBack={() => setRange(false)}/>;
  return <Modal title={weld ? 'Edit weld' : 'Add weld'} subtitle={`${str(iso.isoNo)}${weld ? ` · ${str(weld.weldNo)}` : ''}`} wide onClose={onClose}>
    <form onInvalidCapture={revealInvalidField} onSubmit={event => void submit(event)} noValidate>
      <div className="modal-body weld-form">
        <Failure message={error}/>
        {!weld && <p className="weld-range-link muted">Need several welds at once? <button type="button" className="text-link" onClick={() => setRange(true)}><ListPlus size={14}/>Add welds (range)</button></p>}
        {section('Weld', <>
          <TextField label="Weld no." required value={values.weldNo} error={e.weldNo} onChange={set1('weldNo')}/>
          <SelectField label="Weld type" value={values.typeId} error={e.typeId} options={sortByName(enabled('weld_types', weld?.typeId), 'sort').map(row => ({ value: row.id, label: str(row.name) }))} onChange={set1('typeId')}/>
          <SelectField label="WPS number" value={values.wpsId} error={e.wpsId} options={wpsOptions} hint="Only procedures available to this project." onChange={set1('wpsId')}/>
          <TextField label="Fitup Date" type="date" value={values.datefit} error={e.datefit} onChange={set1('datefit')}/>
          <TextField label="Weld Date" type="date" value={values.date} error={e.date} onChange={set1('date')}/>
        </>, true)}
        {section('Welders', <>
          <SelectField label="Welder" value={values.welder1Id} error={e.welder1Id} options={welderOptions(welders, [values.welder1Id])} onChange={set1('welder1Id')}/>
          <CheckField label="Multiple welders?" checked={multiple} onChange={checked => { setMultiple(checked); if (!checked) set({ welder2Id: '', welder3Id: '', welder4Id: '' }); }}/>
          {multiple && [2, 3, 4].map(index => <SelectField key={index} label={`Welder ${index}`} value={values[`welder${index}Id`]} error={e[`welder${index}Id`]} options={welderOptions(welders, [values[`welder${index}Id`]])} onChange={set1(`welder${index}Id`)}/>)}
        </>, true)}
        {section('Diameter and length', <>
          <SelectField label="Dia." value={explicit ? '__length' : diameterOptionValue(diameters, values.diameterId)} error={e.diameterId} placeholder="Select diameter" options={[{ value: '__length', label: '-- Length in mm --' }, ...diameters]} onChange={value => set(value === '__length' ? { lengthMode: 'Length in mm', diameterId: '' } : { lengthMode: 'Diameter', diameterId: value, dialen: '', ndtpercent: '' })}/>
          {explicit && <TextField label="Length in mm" type="number" min={0} value={values.dialen} error={e.dialen} onChange={value => set({ dialen: value === '' ? '' : Number(value) })}/>}
          {explicit && Boolean(values.ndoReq) && <TextField label="NDT percent" type="number" min={0} max={100} value={values.ndtpercent} error={e.ndtpercent} hint="0 to 100. Only for an explicit length with NDT required." onChange={value => set({ ndtpercent: value === '' ? '' : Number(value) })}/>}
        </>)}
        {section('Coating, sleeve and spool', <>
          <SelectField label="Coating 1" value={values.coating1Id} error={e.coating1Id} options={options('coatings', nameOf, undefined, weld?.coating1Id)} onChange={set1('coating1Id')}/>
          <SelectField label="Coating weld" value={values.coatingWeldId} error={e.coatingWeldId} options={options('coatings', nameOf, undefined, weld?.coatingWeldId)} onChange={set1('coatingWeldId')}/>
          <SelectField label="Coating 2" value={values.coating2Id} error={e.coating2Id} options={options('coatings', nameOf, undefined, weld?.coating2Id)} onChange={set1('coating2Id')}/>
          <TextField label="Sleeve" value={values.sleeve} error={e.sleeve} onChange={set1('sleeve')}/>
          <SelectField label="Spool" value={values.spoolId} error={e.spoolId} options={options('spools', nameOf, row => row.isoId === iso.id)} onChange={set1('spoolId')}/>
        </>)}
        {section('Details', <>
          <TextField label="KR" value={values.kr} error={e.kr} onChange={set1('kr')}/><TextField label="FP" value={values.fp} error={e.fp} onChange={set1('fp')}/>
          <TextField label="Ins. length 1" value={values.insLength} error={e.insLength} onChange={set1('insLength')}/><TextField label="Ins. length 2" value={values.insLength2} error={e.insLength2} onChange={set1('insLength2')}/>
          <SelectField label="Weld process" value={values.processId} error={e.processId} options={options('weld_processes', nameOf, undefined, weld?.processId)} onChange={set1('processId')}/>
        </>)}
        {section('Welding wire', <>
          <SelectField label="Welding wire 1" value={values.wire1Id} error={e.wire1Id} options={options('welding_wires', nameOf)} onChange={set1('wire1Id')}/><TextField label="Pos 1" value={values.pos1} error={e.pos1} onChange={set1('pos1')}/>
          <SelectField label="Welding wire 2" value={values.wire2Id} error={e.wire2Id} options={options('welding_wires', nameOf)} onChange={set1('wire2Id')}/><TextField label="Pos 2" value={values.pos2} error={e.pos2} onChange={set1('pos2')}/>
        </>)}
        {section('Material side 1 · Charge number 1', charge(1))}
        {section('Material side 2 · Charge number 2', charge(2))}
        {section('Inspection requirements', <>
          {FLAGS.map(name => <CheckField key={name} label={FLAG_LABELS[name]} checked={Boolean(values[name])} onChange={set1(name)}/>)}
          <CheckField label="Tracer" checked={Boolean(weld?.tracer)} disabled hint="Set by the tracer workflow."/>
        </>)}
      </div>
      <div className="modal-footer">
        <button type="button" className="btn" disabled={busy} onClick={onClose}>Cancel</button>
        {weld && <button type="button" className="btn" disabled={busy} onClick={event => void submit(event as unknown as FormEvent, true)}>Add new</button>}
        <button className="btn primary" disabled={busy}>{busy && <Loader2 size={15} className="spin"/>}{weld ? 'Update' : 'Add weld'}</button>
      </div>
    </form>
  </Modal>;
}

// --------------------------------------------------------------------------------------------------- add welds (range)

function RangeDialog({ iso, data, onClose, onBack }: { iso: Row; data: WeldData; onClose: () => void; onBack?: () => void }) {
  const { rows, refresh, notify } = useWorkspace();
  const [start, setStart] = useState<number | ''>(''), [end, setEnd] = useState<number | ''>(''), [diameterId, setDiameter] = useState('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const diameters = useDiameterOptions();
  let plan: ReturnType<typeof planWeldRange> | null = null, problem = '';
  if (start !== '' && end !== '') { try { plan = planWeldRange(start, end, data.welds.map(weld => str(weld.weldNo))); } catch (failure) { problem = (failure as Error).message; } }
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    if (start === '' || end === '') { setError('Enter Weld no. Start and End.'); return; }
    setBusy(true);
    try { await post('/actions/add-welds', { isoId: iso.id, start, end, ...(diameterId ? { diameterId } : {}) }); await refresh(); notify(`${plan?.numbers.length ?? 'The'} welds added.`); onClose(); }
    catch (failure) { setError(errorMessage(failure)); } finally { setBusy(false); }
  }
  return <Modal title="Add welds" subtitle={`${str(iso.isoNo)} · range`} onClose={onClose}>
    <form onSubmit={event => void submit(event)} noValidate><div className="modal-body">
      <Failure message={error || problem}/>
      <div className="form-grid">
        <TextField label="Weld no. Start" required type="number" min={0} value={start} onChange={value => setStart(value === '' ? '' : Number(value))}/>
        <TextField label="Weld no. End" required type="number" min={0} value={end} onChange={value => setEnd(value === '' ? '' : Number(value))}/>
        <SelectField label="Dia." value={diameterOptionValue(diameters, diameterId)} placeholder="Select diameter" options={diameters} onChange={setDiameter}/>
      </div>
      {plan && <p className="weld-range-preview" role="status">{plan.numbers.length ? <>Adds <strong>{plan.numbers.length}</strong> {plan.numbers.length === 1 ? 'weld' : 'welds'}: {plan.numbers.slice(0, 8).join(', ')}{plan.numbers.length > 8 ? ` … ${plan.numbers.at(-1)}` : ''}.</> : 'Every number in this range already exists.'}{plan.skipped.length > 0 && <> Skipped, already on the isometric: {plan.skipped.slice(0, 8).join(', ')}{plan.skipped.length > 8 ? '…' : ''}.</>}</p>}
      <p className="muted">All welds of the range are added together or none are. They follow the existing numbering and come last in the table.</p>
    </div><div className="modal-footer">{onBack && <button type="button" className="btn" disabled={busy} onClick={onBack}>Back</button>}<button type="button" className="btn" disabled={busy} onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || !plan?.numbers.length}>{busy && <Loader2 size={15} className="spin"/>}Add welds</button></div></form>
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
  const wpsOptions = activeRows(rows, 'wps').filter(row => row.active !== false && data.project && availableWps(rows, row, data.project.id)).map(row => ({ value: row.id, label: str(row.name) }));
  const flag = (name: string, label: string) => <SelectField key={name} label={label} value={changes[name] === undefined ? '' : changes[name] ? 'yes' : 'no'} placeholder="Keep current" options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} onChange={value => set(name)(value === '' ? '' : value === 'yes')}/>;
  const chargeField = (entry: MassEditItem) => { const side = entry.side!; return <SelectField key={entry.name} label={entry.label} value={chargeValue(changes, side)} placeholder="Keep current" options={chargeOptions(data, str(changes[`certificate${side}Id`]))} error={fields[`chargeNo${side}`] || fields[`certificate${side}Id`]} onChange={value => setChanges(current => { const next = { ...current }; for (const name of [`chargeNo${side}`, `certificate${side}Id`, `material${side}Id`]) delete next[name]; return value ? { ...next, ...chargeSelection(value, side, data.certificates) } : next; })}/>; };
  const control = (entry: MassEditItem, extra?: string) => {
    if (entry.control === 'text') return <TextField key={entry.name} label={entry.label} value={changes[entry.name]} onChange={set(entry.name)}/>;
    if (entry.control === 'charge') return chargeField(entry);
    const list = entry.control === 'welder' ? welderOptions(rows.welders || [], []) : entry.control === 'wps' ? wpsOptions : options(entry.catalog!);
    return <SelectField key={entry.name} label={entry.label} extra={extra} value={changes[entry.name]} error={fields[entry.name]} placeholder="Keep current" options={list} onChange={set(entry.name)}/>;
  };
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setFields({});
    const body = { ...changes, ...(clear.datefit ? { clearDatefit: true } : {}), ...(clear.date ? { clearDate: true } : {}) };
    if (lengthMode && changes.dialen === undefined) { setError('Length in mm must be a number above zero.'); setFields({ dialen: 'Length in mm must be a number above zero.' }); return; }
    const read = readMassEdit(body);
    if (Object.keys(read.errors).length) { setError(read.errors._ || Object.values(read.errors)[0]); setFields(read.errors); return; }
    if (selected.some(weld => massEditMissingFields(data.site, weld, read.changes).length)) { setError(MASS_EDIT_MANDATORY_MESSAGE); return; }
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
function BringBackDialog({ weld, onClose }: { weld: Row; onClose: () => void }) {
  const { refresh, notify } = useWorkspace(); const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function bring() {
    setBusy(true); setError('');
    try { await post(`/records/welds/${weld.id}/archive`, { _version: weld._version }); await refresh(); notify(`Weld ${str(weld.weldNo)} is back in the table.`); onClose(); } catch (failure) { setError(errorMessage(failure)); } finally { setBusy(false); }
  }
  return <Modal title={WELD_BRING_BACK_WORDING.title} onClose={onClose}><div className="modal-body"><Failure message={error}/><p>{WELD_BRING_BACK_WORDING.text}</p></div>
    <div className="modal-footer"><button type="button" className="btn" disabled={busy} onClick={onClose}>{WELD_BRING_BACK_WORDING.cancel}</button><button type="button" className="btn primary" disabled={busy} onClick={() => void bring()}>{busy && <Loader2 size={15} className="spin"/>}{WELD_BRING_BACK_WORDING.button}</button></div></Modal>;
}

// --------------------------------------------------------------------------------------------------- the table

const COLUMNS = ['Sort', 'WN', 'Type', 'Wdr', 'VI', 'NDT (Pre)', 'NDT', 'Pre-HT/PWHT', 'Idx', 'Chg.No.', 'Material ①', 'Idx', 'Chg.No.', 'Material ②', 'WPS', 'D', 'S', 'Options'];

function WeldTable({ iso, onAttachments, onAuditTrail, onSetPhase, canSetPhase, canAttachments, switcher }: { iso: Row; onAttachments: () => void; onAuditTrail: () => void; onSetPhase: () => void; canSetPhase: boolean; canAttachments: boolean; switcher: ReactNode }) {
  const { canRecord, canRun, refresh, notify } = useWorkspace(); const data = useWeldData(iso);
  const [selected, setSelected] = useState<string[]>([]), [query, setQuery] = useState(''), [showDeleted, setShowDeleted] = useState(false);
  const [dialog, setDialog] = useState<'add' | 'mass' | 'delete' | 'punch' | null>(null), [editing, setEditing] = useState<Row | null>(null), [stamping, setStamping] = useState<Row | null>(null), [removing, setRemoving] = useState<Row[]>([]), [restoring, setRestoring] = useState<Row | null>(null);
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
      case 'attachments': return <button type="button" disabled={!canAttachments} onClick={onAttachments}>{label}</button>;
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
      : showDeleted ? <EmptyState title={WELD_BRING_BACK_WORDING.emptyTitle} description={WELD_BRING_BACK_WORDING.emptyText}/>
      : <EmptyState title="No welds on this isometric" description="Add the first weld, or add a range of weld numbers at once." action={canAdd ? <button type="button" className="btn primary" onClick={() => setDialog('add')}><Plus size={16}/>Add weld</button> : undefined}/>}
    {welds.length > 0 && !showDeleted && <p className="muted weld-legend"><Lock size={13}/> A padlock marks a weld of a completed phase: field welds after the Field release, shop welds after the Prefab release. Reopen the release to change them.</p>}
    {dialog === 'add' && <WeldDialog iso={iso} data={data} onClose={() => setDialog(null)}/>}
    {editing && <WeldDialog iso={iso} weld={editing} data={data} onClose={() => setEditing(null)}/>}
    {stamping && <StampDialog weld={stamping} data={data} onClose={() => setStamping(null)}/>}
    {dialog === 'mass' && <MassEditDialog iso={iso} data={data} selected={checked} onClose={() => setDialog(null)} onDone={() => setSelected([])}/>}
    {dialog === 'delete' && <DeleteDialog welds={removing} onClose={() => setDialog(null)} onDone={() => setSelected([])}/>}
    {dialog === 'punch' && <IsoPunchDialog iso={iso} onClose={() => setDialog(null)}/>}
    {restoring && <BringBackDialog weld={restoring} onClose={() => setRestoring(null)}/>}
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
