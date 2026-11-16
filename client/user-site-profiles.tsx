import { useId } from 'react';
import type { Row } from '../shared/types.ts';
import { siteIdsField, siteProfilesField, siteProfilesOf, type ScopePilot } from '../shared/site-scope.ts';
import { useWorkspace, activeRows } from './context.tsx';
import { TableScroll } from './components.tsx';

const TITLES: Record<ScopePilot, string> = { weld: 'Weld Pilot', mto: 'MTO Pilot' };

/**
 * User form, one application with 'Specific project site(s)': the reference 'Home location | Profile' table. Each main
 * project has a checkbox (the account works there) and a profile (the account's rights there). A ticked main project
 * without a profile of its own uses `fallback`, the pilot's profile; ticking one stores the profile shown, so what the
 * table shows is what is saved. The server checks every value (server/site-scope.ts `assertSiteProfiles`).
 */
export function UserSiteProfiles({ pilot, values, fallback, error, onChange }: { pilot: ScopePilot; values: Record<string, unknown>; fallback: string; error?: string; onChange: (name: string, value: unknown) => void }) {
  const { allRows, rows } = useWorkspace(); const id = useId().replaceAll(':', '');
  const sites = activeRows(allRows, 'sites').sort((a, b) => String(a.name).localeCompare(String(b.name), 'en', { numeric: true }));
  const profiles = activeRows(rows, 'profiles').sort((a, b) => String(a.name).localeCompare(String(b.name), 'en', { numeric: true }));
  const ticked = new Set(Array.isArray(values[siteIdsField(pilot)]) ? (values[siteIdsField(pilot)] as unknown[]).map(String) : []);
  const chosen = siteProfilesOf(values[siteProfilesField(pilot)]);
  const save = (next: Record<string, string>) => onChange(siteProfilesField(pilot), Object.keys(next).length ? JSON.stringify(next) : '');
  function tick(site: Row, on: boolean) {
    onChange(siteIdsField(pilot), on ? [...new Set([...ticked, site.id])] : [...ticked].filter(item => item !== site.id));
    const next = { ...chosen };
    if (on) next[site.id] = chosen[site.id] || fallback; else delete next[site.id];
    save(Object.fromEntries(Object.entries(next).filter(([, profile]) => profile)));
  }
  const choose = (site: Row, profileId: string) => save({ ...chosen, [site.id]: profileId });
  const title = `${TITLES[pilot]} project sites`;
  return <div className="field full-width user-site-profiles">
    <span className="field-label" id={`${id}-title`}>{title}</span>
    {sites.length ? <TableScroll><table className="data-table" aria-labelledby={`${id}-title`}>
      <thead><tr><th scope="col">Home location</th><th scope="col">Profile</th></tr></thead>
      <tbody>{sites.map(site => {
        const on = ticked.has(site.id), value = chosen[site.id] || fallback;
        return <tr key={site.id}>
          <td><label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={on} onChange={event => tick(site, event.target.checked)}/><span>{String(site.name)}</span></label></td>
          <td><div className="select-wrap"><select aria-label={`Profile for ${String(site.name)}`} value={value} disabled={!on} onChange={event => choose(site, event.target.value)}>
            {!value && <option value="">Select a profile</option>}
            {profiles.map(profile => <option key={profile.id} value={profile.id}>{String(profile.name)}</option>)}
          </select></div></td>
        </tr>;
      })}</tbody>
    </table></TableScroll> : <small className="field-hint">No main project exists yet.</small>}
    <small className="field-hint">The account works only on the ticked main projects, each with its own profile.</small>
    {error && <small className="field-error" role="alert">{error}</small>}
  </div>;
}
