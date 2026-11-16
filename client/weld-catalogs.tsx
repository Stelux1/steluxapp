import { useState } from 'react';
import { Check, ChevronDown, Loader2, ToggleLeft, ToggleRight } from 'lucide-react';
import type { Field, Row } from '../shared/types.ts';
import { ENABLED_COLUMN, enableLabel, enabledOnSite, enablementKey } from '../shared/weld-catalogs.ts';
import { useWorkspace } from './context.tsx';
import { post } from './api.ts';
import { Badge, Dropdown } from './components.tsx';

/**
 * "Enabled on this site" for the catalogs that carry it (shared/weld-catalogs.ts): the list column, the Options menu
 * for checked rows and the form checkbox. Only the hosted profile with an active main project shows any of it.
 */
export function useSiteEnablement(resourceKey: string) {
  const { siteId, allRows, rows, user } = useWorkspace();
  const active = Boolean(user.availability?.features.includes('pilots')) && enablementKey(resourceKey) && Boolean(siteId);
  const siteName = String(allRows.sites?.find(site => site.id === siteId)?.name || '');
  return { active, siteId, siteName, rows };
}

/** The checkbox of the record form; its value travels as `enabledOnSite` next to `enabledSiteId`. */
export const enablementField = (siteName: string): Field => ({ name: 'enabledOnSite', label: enableLabel(siteName), type: 'checkbox', default: true, hint: 'Applies to this main project only. Other main projects keep their own setting.' });

export const EnabledOnSiteHead = () => <th>{ENABLED_COLUMN}</th>;
export function EnabledOnSiteCell({ resourceKey, row }: { resourceKey: string; row: Row }) {
  const { siteId, rows } = useSiteEnablement(resourceKey);
  return enabledOnSite(resourceKey, row, siteId, rows) ? <span className="check-value"><Check size={14}/>Yes</span> : <Badge color="neutral">No</Badge>;
}

/** The Options menu of the list: switch the checked records on or off for the active main project. */
export function CatalogOptions({ resourceKey, records }: { resourceKey: string; records: Row[] }) {
  const { siteId, siteName } = useSiteEnablement(resourceKey);
  const { refresh, notify } = useWorkspace();
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function apply(enabled: boolean) {
    setBusy(true); setError('');
    try {
      await post(`/bulk/${resourceKey}`, { ids: records.map(row => row.id), versions: Object.fromEntries(records.map(row => [row.id, row._version])), changes: { enabledOnSite: enabled, enabledSiteId: siteId } });
      await refresh(); notify(`${records.length} ${records.length === 1 ? 'record' : 'records'} ${enabled ? 'activated' : 'deactivated'} on ${siteName}.`);
    } catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
  }
  return <div className="catalog-options">
    <Dropdown label="Options" trigger={<span className="btn subtle small">{busy ? <Loader2 size={15} className="spin"/> : null}Options<ChevronDown size={12}/></span>}>
      <button type="button" disabled={!records.length || busy} onClick={() => void apply(true)}><ToggleRight size={14}/>Activate on this site</button>
      <button type="button" disabled={!records.length || busy} onClick={() => void apply(false)}><ToggleLeft size={14}/>Deactivate on this site</button>
      {!records.length && <p className="catalog-options-hint">Check one or more records first.</p>}
    </Dropdown>
    {error && <span className="catalog-options-error" role="alert">{error}</span>}
  </div>;
}
