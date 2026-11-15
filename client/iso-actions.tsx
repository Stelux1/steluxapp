import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Modal } from './components.tsx';
import { RESOURCE_MAP } from './catalog.ts';
import { post } from './api.ts';
import { activeRows, useWorkspace } from './context.tsx';
import type { Row } from '../shared/types.ts';

type Change = 'keep' | 'on' | 'off';

/** A phase checkbox that can stand for "the checked isometrics differ" until the user decides. */
function PhaseBox({ id, label, current, change, onChange }: { id: string; label: string; current: boolean | 'mixed'; change: Change; onChange: (next: Change) => void }) {
  const box = useRef<HTMLInputElement>(null);
  const checked = change === 'on' || (change === 'keep' && current === true);
  const indeterminate = change === 'keep' && current === 'mixed';
  useEffect(() => { if (box.current) box.current.indeterminate = indeterminate; }, [indeterminate]);
  // Keep -> the opposite of what is stored -> (mixed only) the other value -> keep. Returning to the stored value drops the change.
  const next = (): Change => current === 'mixed' ? (change === 'keep' ? 'on' : change === 'on' ? 'off' : 'keep') : change === 'keep' ? (current ? 'off' : 'on') : 'keep';
  return <label className={`iso-phase-box ${change !== 'keep' ? 'changed' : ''}`} htmlFor={id}><input ref={box} id={id} type="checkbox" checked={checked} aria-checked={indeterminate ? 'mixed' : checked} onChange={() => onChange(next())}/><span>{label}</span>{change !== 'keep' && <small>{change === 'on' ? 'will be set' : 'will be cleared'}</small>}{indeterminate && <small>differs between isometrics</small>}</label>;
}

/** Set phase: the eight phase flags of one isometric or of every checked one. Only the flags that were changed are sent. */
export function PhaseDialog({ records, onClose, onDone }: { records: Row[]; onClose: () => void; onDone?: () => void }) {
  const { refresh, notify } = useWorkspace();
  const flags = (RESOURCE_MAP.isometrics?.fields || []).filter(field => field.section === 'Phases');
  const [changes, setChanges] = useState<Record<string, Change>>({}), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const stored = (name: string): boolean | 'mixed' => records.every(row => row[name] === true) ? true : records.every(row => row[name] !== true) ? false : 'mixed';
  const changed = flags.filter(field => (changes[field.name] || 'keep') !== 'keep');
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!records.length || !changed.length) return; setBusy(true); setError('');
    try {
      await post('/actions/phases', { isoIds: records.map(row => row.id), ...Object.fromEntries(changed.map(field => [field.name, changes[field.name] === 'on' ? 'Complete' : 'Incomplete'])) });
      await refresh(); notify(`Phases updated on ${records.length} isometric${records.length === 1 ? '' : 's'}.`); onDone?.(); onClose();
    } catch (failure) { setError((failure as Error).message || 'The phases could not be saved.'); } finally { setBusy(false); }
  }
  const title = records.length === 1 ? String(records[0].isoNo) : `${records.length} checked isometrics`;
  return <Modal title="Set phase" subtitle={records.length ? title : 'No isometrics checked'} onClose={onClose}>
    <form onSubmit={event => void submit(event)}><div className="modal-body">
      {error && <div className="alert error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}
      {!records.length ? <p className="muted">Check at least one isometric in the list first.</p> : <>
        <p className="muted">{records.length === 1 ? 'Tick or untick the phases that are complete.' : 'Only the phases you tick or untick are changed; the others keep their value on every isometric.'}</p>
        <fieldset className="iso-phase-grid"><legend className="sr-only">Phase flags</legend>{flags.map(field => <PhaseBox key={field.name} id={`phase-${field.name}`} label={field.label} current={stored(field.name)} change={changes[field.name] || 'keep'} onChange={next => setChanges(current => ({ ...current, [field.name]: next }))}/>)}</fieldset></>}
    </div><div className="modal-footer"><button type="button" className="btn" disabled={busy} onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || !records.length || !changed.length}>{busy && <Loader2 size={15} className="spin"/>}Save phases</button></div></form>
  </Modal>;
}

/** Copy isometrics into another subproject of the same main project. The server decides; the dialog only shows what it will refuse. */
export function CopyIsometricsDialog({ records, onClose, onDone }: { records: Row[]; onClose: () => void; onDone?: () => void }) {
  const { rows, refresh, notify, canRun } = useWorkspace();
  const projects = activeRows(rows, 'projects');
  const sites = [...new Set(records.map(row => projects.find(project => project.id === row.projectId)?.siteId))];
  const site = sites.length === 1 ? sites[0] : undefined;
  const targets = projects.filter(project => site && project.siteId === site);
  const [targetId, setTargetId] = useState(''), [copy, setCopy] = useState({ copyWelds: false, copyMaterials: false, copyCalculations: false });
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const target = targets.find(project => project.id === targetId);
  const taken = new Set(activeRows(rows, 'isometrics').filter(row => row.projectId === targetId).map(row => String(row.isoNo).trim().toLowerCase()));
  const clashes = targetId ? records.filter(row => taken.has(String(row.isoNo).trim().toLowerCase())).map(row => String(row.isoNo)) : [];
  const options = [
    { key: 'copyWelds' as const, label: 'Copy welds', allowed: canRun('copy-isometrics', { copyWelds: true }), why: 'Your profile cannot add welds.', hint: 'Weld definitions only: no welders, dates, charge numbers, inspections or releases.' },
    { key: 'copyMaterials' as const, label: 'Copy materials', allowed: canRun('copy-isometrics', { copyMaterials: true }), why: 'Your profile cannot add material requirements.', hint: 'Requirements with quantity and phase, without orders, stock or picks.' },
    { key: 'copyCalculations' as const, label: 'Copy calculations', allowed: canRun('copy-isometrics', { copyCalculations: true }) && copy.copyMaterials, why: canRun('copy-isometrics', { copyCalculations: true }) ? 'Tick Copy materials first: calculation lines refer to materials.' : 'Your profile cannot add calculation lines.', hint: 'Calculation and cut-list lines that refer to the copied materials.' },
  ];
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await post('/actions/copy-isometrics', { isoIds: records.map(row => row.id), projectId: targetId, ...copy });
      await refresh(); notify(`${records.length} isometric${records.length === 1 ? '' : 's'} copied to ${String(target?.internnumber || 'the target project')}.`); onDone?.(); onClose();
    } catch (failure) { setError((failure as Error).message || 'Copying failed.'); } finally { setBusy(false); }
  }
  const names = records.slice(0, 3).map(row => String(row.isoNo)).join(', ') + (records.length > 3 ? ` and ${records.length - 3} more` : '');
  return <Modal title="Copy isometrics" subtitle={records.length ? `${records.length} checked · ${names}` : 'No isometrics checked'} onClose={onClose}>
    <form onSubmit={event => void submit(event)}><div className="modal-body">
      {error && <div className="alert error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}
      {!records.length ? <p className="muted">Check at least one isometric in the list first.</p> : !site ? <div className="alert error" role="alert"><AlertCircle size={18}/><span>The checked isometrics belong to different main projects. Check isometrics of one main project only.</span></div> : <>
        <div className="field"><label htmlFor="copy-target">Target project</label><select id="copy-target" required value={targetId} onChange={event => { setTargetId(event.target.value); setError(''); }}><option value="">Choose a subproject</option>{targets.map(project => <option key={project.id} value={project.id}>{String(project.internnumber)}{project.description ? ` · ${String(project.description)}` : ''}</option>)}</select><small className="field-hint">Only subprojects of the same main project are offered.</small></div>
        {clashes.length > 0 && <div className="alert error" role="alert"><AlertCircle size={18}/><span>ISO number{clashes.length === 1 ? '' : 's'} {clashes.join(', ')} already exist{clashes.length === 1 ? 's' : ''} in {String(target?.internnumber)}. Choose another project; nothing is copied while a number is taken.</span></div>}
        <fieldset className="iso-copy-options"><legend>What to copy with the isometrics</legend>
          {options.map(option => <div className="checkbox-field" key={option.key}><label htmlFor={`copy-${option.key}`}><input id={`copy-${option.key}`} type="checkbox" disabled={!option.allowed} checked={copy[option.key] && option.allowed} aria-describedby={`copy-${option.key}-note`} onChange={event => setCopy(current => ({ ...current, [option.key]: event.target.checked, ...(option.key === 'copyMaterials' && !event.target.checked ? { copyCalculations: false } : {}) }))}/><span>{option.label}</span></label><small id={`copy-${option.key}-note`}>{option.allowed ? option.hint : option.why}</small></div>)}
        </fieldset>
        <p className="muted">The copy keeps the descriptive and technical fields and the current revision numbers. Documents, progress and phase flags start empty.</p></>}
    </div><div className="modal-footer"><button type="button" className="btn" disabled={busy} onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || !records.length || !site || !targetId || clashes.length > 0}>{busy && <Loader2 size={15} className="spin"/>}Copy isometrics</button></div></form>
  </Modal>;
}
