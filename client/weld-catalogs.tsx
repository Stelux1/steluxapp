import { useState } from 'react';
import { Check, ChevronDown, Loader2, ToggleLeft, ToggleRight } from 'lucide-react';
import type { Field, Row } from '../shared/types.ts';
import { ENABLED_COLUMN, FORM_ENABLEMENT, NORM_BAR_NORMS, OPTIONS_WORDING, codesOfNorm, enableLabel, enabledOnSite, enablementKey, formEnablement } from '../shared/weld-catalogs.ts';
import { useWorkspace } from './context.tsx';
import { post } from './api.ts';
import { Badge, Dropdown, Modal } from './components.tsx';

/**
 * "Enabled on this site" for the catalogs that carry it (shared/weld-catalogs.ts): the list column, the Options menu
 * for checked rows and the form checkbox. Only the hosted profile with an active main project shows any of it.
 */
export function useSiteEnablement(resourceKey: string) {
  const { siteId, allRows, rows, user } = useWorkspace();
  const active = Boolean(user.availability?.features.includes('pilots')) && enablementKey(resourceKey) && Boolean(siteId);
  const siteName = String(allRows.sites?.find(site => site.id === siteId)?.name || '');
  // The form box exists on some catalogs only (shared/weld-catalogs.ts FORM_ENABLEMENT); the list column and Options are on every one.
  return { active, siteId, siteName, rows, form: active && formEnablement(resourceKey) };
}

/** The checkbox of the record form; its value travels as `enabledOnSite` next to `enabledSiteId`. */
export const enablementField = (siteName: string, resourceKey = ''): Field => ({ name: 'enabledOnSite', label: enableLabel(siteName), type: 'checkbox', default: FORM_ENABLEMENT[resourceKey] ?? true, hint: 'Applies to this main project only. Other main projects keep their own setting.' });

export const EnabledOnSiteHead = () => <th>{ENABLED_COLUMN}</th>;
export function EnabledOnSiteCell({ resourceKey, row }: { resourceKey: string; row: Row }) {
  const { siteId, rows } = useSiteEnablement(resourceKey);
  return enabledOnSite(resourceKey, row, siteId, rows) ? <span className="check-value"><Check size={14}/>Yes</span> : <Badge color="neutral">No</Badge>;
}

/**
 * The Options menu of the list (inactive until a row is checked): Activate selected / Deactivate selected, each with a
 * Confirm step, switch the checked records on or off for the active main project.
 */
export function CatalogOptions({ resourceKey, records }: { resourceKey: string; records: Row[] }) {
  const { siteId, siteName } = useSiteEnablement(resourceKey);
  const { refresh, notify } = useWorkspace();
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [confirming, setConfirming] = useState<boolean | null>(null);
  async function apply(enabled: boolean) {
    setBusy(true); setError('');
    try {
      await post(`/bulk/${resourceKey}`, { ids: records.map(row => row.id), versions: Object.fromEntries(records.map(row => [row.id, row._version])), changes: { enabledOnSite: enabled, enabledSiteId: siteId } });
      await refresh(); notify(`${records.length} ${records.length === 1 ? 'record' : 'records'} ${enabled ? 'activated' : 'deactivated'} on ${siteName}.`); setConfirming(null);
    } catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
  }
  const wording = confirming ? OPTIONS_WORDING.activate : OPTIONS_WORDING.deactivate;
  const close = () => { if (!busy) { setConfirming(null); setError(''); } };
  return <div className="catalog-options">
    {records.length ? <Dropdown label="Options" trigger={<span className="btn subtle small">{busy ? <Loader2 size={15} className="spin"/> : null}Options<ChevronDown size={12}/></span>}>
      <button type="button" disabled={busy} onClick={() => { setError(''); setConfirming(true); }}><ToggleRight size={14}/>{OPTIONS_WORDING.activate.item}</button>
      <button type="button" disabled={busy} onClick={() => { setError(''); setConfirming(false); }}><ToggleLeft size={14}/>{OPTIONS_WORDING.deactivate.item}</button>
    </Dropdown> : <button type="button" className="btn subtle small" disabled title={OPTIONS_WORDING.none}>Options<ChevronDown size={12}/></button>}
    {error && confirming === null && <span className="catalog-options-error" role="alert">{error}</span>}
    {confirming !== null && <Modal title={wording.title} onClose={close}>
      <div className="modal-body"><p>{wording.text}</p>{error && <div className="alert error" role="alert">{error}</div>}</div>
      <div className="modal-footer"><button type="button" className="btn" disabled={busy} onClick={close}>{OPTIONS_WORDING.cancel}</button><button type="button" className="btn primary" disabled={busy} onClick={() => void apply(confirming)}>{busy && <Loader2 size={15} className="spin"/>}{OPTIONS_WORDING.confirm}</button></div>
    </Modal>}
  </div>;
}

/** Defect codes: filter the list by norm and switch every code of a norm on for the active main project. */
export function DefectNormBar({ norm, onNorm }: { norm: string; onNorm: (value: string) => void }) {
  const { siteId, siteName, active } = useSiteEnablement('ndt_defect_codes');
  const { rows, refresh, notify, canRecord } = useWorkspace();
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const codes = codesOfNorm(rows.ndt_defect_codes || [], norm);
  async function activate() {
    setBusy(true); setError('');
    try {
      await post('/bulk/ndt_defect_codes', { ids: codes.map(row => row.id), versions: Object.fromEntries(codes.map(row => [row.id, row._version])), changes: { enabledOnSite: true, enabledSiteId: siteId } });
      await refresh(); notify(`${codes.length} ${norm} ${codes.length === 1 ? 'code' : 'codes'} activated on ${siteName}.`);
    } catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
  }
  return <div className="defect-norm-bar">
    <div className="field"><label htmlFor="defect-norm-select">Norm</label>
      <div className="select-wrap"><select id="defect-norm-select" value={norm} onChange={event => onNorm(event.target.value)}><option value="">All</option>{NORM_BAR_NORMS.map(value => <option key={value} value={value}>{value}</option>)}</select><ChevronDown size={14}/></div></div>
    {active && canRecord('ndt_defect_codes', 'edit') && <button type="button" className="btn small primary" disabled={busy || !norm || !codes.length} onClick={() => void activate()}>{busy && <Loader2 size={15} className="spin"/>}Activate on this site</button>}
    <span className="defect-norm-help">Tick rows and use Options, or pick a norm and activate all its codes on this site.</span>
    {error && <span className="catalog-options-error" role="alert">{error}</span>}
  </div>;
}
