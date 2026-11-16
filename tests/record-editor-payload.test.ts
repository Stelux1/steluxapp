import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../server/store.ts';
import { seed } from '../server/seed.ts';
import { createApp } from '../server/http.ts';
import { HOSTED_RELEASE_PROFILE, availabilityFor } from '../shared/release.ts';
import { flangeEditorResource, flangeFieldInDialog } from '../shared/flanges.ts';
import { pilotResource } from '../shared/weld-catalogs.ts';
import * as catalog from '../client/catalog.ts';
import { editorChange, editorFieldValues, editorPayload, flangeOpenValues } from '../client/editor-values.ts';
import type { Bootstrap, Row } from '../shared/types.ts';

/**
 * SB2 N9-1: the Add flange dialog sent `spoolId: ""` and `wpsId: ""` once an isometric was chosen, fields the flange
 * resource does not have, and the server answered 404. The earlier tests posted hand-written bodies, never what the
 * form builds, so they could not see it. These tests build the body with the form's own functions.
 */
async function hosted(t: { after: (fn: () => Promise<void>) => void }) {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-editor-'));
  const store = new Store(join(dir, 'test.sqlite')); seed(store);
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Workspace</title>');
  const server = createApp(store, dir, { releaseProfile: HOSTED_RELEASE_PROFILE, distDir: dir }).listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`; let cookie = '';
  t.after(async () => { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); store.close(); rmSync(dir, { recursive: true, force: true }); });
  const request = async (path: string, method = 'GET', data?: unknown) => {
    const response = await fetch(origin + path, { method, headers: { 'Content-Type': 'application/json', 'X-Stelux-Request': '1', 'X-Stelux-Pilot': 'weld', Origin: origin, ...(cookie ? { Cookie: cookie } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) });
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie')!.split(';')[0]; return response;
  };
  assert.equal((await request('/api/auth/setup', 'POST', { name: 'Editor admin', email: 'editor-admin@example.test', password: 'Editor-Test-Password' })).status, 201);
  const data = await (await request('/api/bootstrap')).json() as Bootstrap;
  catalog.configureCatalog(availabilityFor(HOSTED_RELEASE_PROFILE));
  const def = flangeEditorResource(pilotResource(catalog.RESOURCE_MAP.flanges, 'weld'), true);
  return { request, data, def };
}

test('Add flange: the body the dialog builds after choosing project and isometric is saved (201)', async t => {
  const { request, data, def } = await hosted(t);
  const iso = data.rows.isometrics.find(row => row.id === 'iso-2')!;
  const context = { fields: def.fields, hosted: true, isometrics: data.rows.isometrics, certifications: data.rows.certifications };
  let values = flangeOpenValues(editorFieldValues(def.fields), undefined, data.rows.isometrics, data.rows.projects);
  values = editorChange('flanges', values, 'projectId', iso.projectId, context);
  values = editorChange('flanges', values, 'isoId', iso.id, context);
  values = editorChange('flanges', values, 'flange_id', 'SB2-FL-01', context);
  values = editorChange('flanges', values, 'target_moment_nm', 300, context);
  assert.ok(!('spoolId' in values) && !('wpsId' in values), 'no field outside the flange resource is added');
  for (const name of Object.keys(values)) assert.ok(def.fields.some(field => field.name === name), `${name} is a flange field`);
  const body = editorPayload(values, undefined, true, () => undefined);
  const created = await request('/api/records/flanges', 'POST', body);
  assert.equal(created.status, 201, await created.clone().text());
  const record = (await created.json()).record as Row;
  assert.equal(record.flange_id, 'SB2-FL-01'); assert.equal(record.isoId, 'iso-2');
  assert.equal(record.line_number, iso.assetTag, 'the asset tag still follows the isometric');
});

test('Edit flange: moving it to another isometric sends only the changed flange fields and saves (200)', async t => {
  const { request, data, def } = await hosted(t);
  const flange = data.rows.flanges[0];
  const target = data.rows.isometrics.find(row => row.id !== flange.isoId && row.projectId)!;
  const fields = def.fields.filter(field => flangeFieldInDialog(field.name, true, true));
  const context = { fields: def.fields, hosted: true, isometrics: data.rows.isometrics };
  let values = flangeOpenValues(editorFieldValues(def.fields, flange), flange, data.rows.isometrics, data.rows.projects);
  values = editorChange('flanges', values, 'projectId', target.projectId, context);
  values = editorChange('flanges', values, 'isoId', target.id, context);
  const body = editorPayload(values, flange, true, name => { const field = def.fields.find(f => f.name === name); return flange[name] ?? field?.default ?? (field?.type === 'checkbox' ? false : ''); });
  assert.ok(fields.length > 0 && !('spoolId' in body));
  const saved = await request(`/api/records/flanges/${flange.id}`, 'PUT', { ...body, _version: flange._version });
  assert.equal(saved.status, 200, await saved.clone().text());
  assert.equal(((await saved.json()).record as Row).isoId, target.id);
});

test('the change rule still clears the spool and WPS where the resource has them (welds)', () => {
  const fields = [{ name: 'isoId' }, { name: 'spoolId' }, { name: 'wpsId' }];
  assert.deepEqual(editorChange('welds', { isoId: 'a', spoolId: 's', wpsId: 'w' }, 'isoId', 'b', { fields, hosted: true }), { isoId: 'b', spoolId: '', wpsId: '' });
  assert.deepEqual(editorChange('welds', { isoId: 'a', spoolId: 's', wpsId: 'w' }, 'isoId', 'b', { fields, hosted: false }), { isoId: 'b', spoolId: '', wpsId: 'w' });
});
