import { useId, useMemo, useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { RESOURCE_MAP } from './catalog.ts';
import { post } from './api.ts';
import { useWorkspace } from './context.tsx';
import { FieldInput, Modal, revealInvalidField } from './components.tsx';
import { ISO_MASS_EDIT_KEEP, isoMassEditChanges, isoMassEditFields, isoMassEditSubtitle, type IsoMassValues } from '../shared/iso-mass-edit.ts';
import type { Row } from '../shared/types.ts';

/**
 * Iso overview → Options → Mass edit: the editable input fields of the isometric, all empty; only the fields that are filled
 * change the checked isometrics (POST /api/bulk/isometrics with just those fields). The server decides every rule.
 */
export function IsoMassEditDialog({ records, onClose, onDone }: { records: Row[]; onClose: () => void; onDone?: () => void }) {
  const { refresh, notify } = useWorkspace(); const id = useId();
  const fields = useMemo(() => isoMassEditFields(RESOURCE_MAP.isometrics.fields), []);
  const groups = useMemo(() => [...new Set(fields.map(field => field.section || 'Details'))], [fields]);
  const [values, setValues] = useState<IsoMassValues>({}), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const changes = isoMassEditChanges(fields, values), count = Object.keys(changes).length;
  const keep = `— ${ISO_MASS_EDIT_KEEP.toLowerCase()}`;
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!count) { setError('Fill at least one field.'); return; }
    setBusy(true); setError('');
    try {
      await post('/bulk/isometrics', { ids: records.map(record => record.id), changes, versions: Object.fromEntries(records.map(record => [record.id, record._version])) });
      await refresh(); notify(`${records.length} ${records.length === 1 ? 'isometric' : 'isometrics'} updated.`); onDone?.(); onClose();
    } catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
  }
  return <Modal title={`Mass edit ${records.length} ${records.length === 1 ? 'isometric' : 'isometrics'}`} subtitle={isoMassEditSubtitle(records.length)} onClose={onClose} wide>
    <form onInvalidCapture={revealInvalidField} onSubmit={event => void submit(event)}><div className="modal-body">
      {error && <div className="alert error" role="alert">{error}</div>}
      {groups.map(group => <details className="form-section" key={group} open><summary>{group}<span>{fields.filter(field => (field.section || 'Details') === group).length} fields</span></summary>
        <div className="form-grid">{fields.filter(field => (field.section || 'Details') === group).map(field => field.type === 'checkbox'
          ? <div className="field" key={field.name}><label htmlFor={`${id}-${field.name}`}>{field.label}</label>
            <select id={`${id}-${field.name}`} value={String(values[field.name] ?? '')} onChange={event => setValues(old => ({ ...old, [field.name]: event.target.value }))}><option value="">{keep}</option><option value="yes">Yes</option><option value="no">No</option></select></div>
          : <FieldInput key={field.name} field={{ ...field, required: false, showIf: undefined, legacy: undefined, default: undefined, hint: undefined, blank: field.type === 'select' || field.type === 'ref' ? keep : undefined }} value={values[field.name] ?? ''} values={values} onChange={value => setValues(old => ({ ...old, [field.name]: value }))}/>)}</div></details>)}
    </div><div className="modal-footer"><span className="muted" role="status">{count} {count === 1 ? 'field' : 'fields'} filled</span><button type="button" className="btn" disabled={busy} onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || !count}>{busy && <Loader2 size={15} className="spin"/>}Update isometrics</button></div></form>
  </Modal>;
}
