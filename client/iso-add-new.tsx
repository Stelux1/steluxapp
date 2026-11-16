import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { ADD_NEW_COPY_OPTIONS, headerFields } from '../shared/iso-pages.ts';
import type { Field, Row } from '../shared/types.ts';
import { post } from './api.ts';
import { useWorkspace } from './context.tsx';

type Copy = Record<typeof ADD_NEW_COPY_OPTIONS[number][0], boolean>;

/**
 * Footer of Edit isometric (reference weld__iso__0001__edit-isometric.txt:156-163): "Add new" saves the form as a NEW isometric
 * and, when ticked, copies the welds, materials and calculations of this one. Update keeps changing this isometric.
 * Each box follows the account's right in the pilot that owns the part (copyParts), as the server decides.
 */
export function AddNewIsometric({ record, fields, values, busy, onError, onSaved }: { record: Row; fields: Field[]; values: Record<string, unknown>; busy: boolean; onError: (message: string, fields?: Record<string, string>) => void; onSaved: () => void }) {
  const { refresh, notify, canRun, copyParts } = useWorkspace(); const navigate = useNavigate();
  const [copy, setCopy] = useState<Copy>({ copyWelds: false, copyMaterials: false, copyCalculations: false }), [working, setWorking] = useState(false);
  const allowed = (key: keyof Copy) => copyParts ? copyParts[key].allowed : canRun('add-new-isometric', { [key]: true });
  const why = (key: keyof Copy) => copyParts?.[key].reason || 'Your profile cannot add this.';
  if (!canRun('add-new-isometric')) return null;
  async function addNew() {
    setWorking(true); onError('');
    const names = headerFields(fields);
    try {
      const result = await post<{ records?: Row[] }>('/actions/add-new-isometric', { isoId: record.id, projectId: values.projectId || record.projectId, values: Object.fromEntries(Object.entries(values).filter(([name]) => names.includes(name))), ...copy });
      await refresh(); notify(`Isometric ${String(values.isoNo ?? '').trim()} added.`); onSaved();
      const created = result.records?.[0]; if (created) navigate(`/workspace/isometrics/${created.id}`);
    } catch (failure) { const error = failure as Error & { fields?: Record<string, string> }; onError(error.message, error.fields); } finally { setWorking(false); }
  }
  return <div className="add-new-isometric" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 14px', marginRight: 'auto' }}>
    <button type="button" className="btn" disabled={busy || working} onClick={() => void addNew()}>{working && <Loader2 size={15} className="spin"/>}Add new</button>
    {ADD_NEW_COPY_OPTIONS.map(([key, label]) => <label key={key} title={allowed(key) ? undefined : why(key)} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12 }}><input type="checkbox" checked={copy[key] && allowed(key)} disabled={busy || working || !allowed(key) || (key === 'copyCalculations' && !copy.copyMaterials)} onChange={event => setCopy(current => ({ ...current, [key]: event.target.checked, ...(key === 'copyMaterials' && !event.target.checked ? { copyCalculations: false } : {}) }))}/>{label}</label>)}
  </div>;
}
