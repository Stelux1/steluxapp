import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runHostedPreparation, SCHEMA_FIRST, type PreparationParts } from '../server/hosted-preparation.ts';
import type { PrepareResult } from '../server/hosted-schema.ts';
import { Store, SYSTEM } from '../server/store.ts';
import { createApp } from '../server/http.ts';
import { RESOURCES } from '../shared/resources.ts';
import { HOSTED_RELEASE_PROFILE } from '../shared/release.ts';
import { STANDARD_DEFECT_CODES, standardDefectCodeId } from '../shared/defect-codes.ts';
import { isLockedRecord } from '../shared/weld-catalogs.ts';
import type { Bootstrap, Row } from '../shared/types.ts';
import { seed } from '../server/seed.ts';
import { upgradeWeldCatalogs } from '../server/catalog-upgrade.ts';
import { loadDiameterCatalog, missingDiameterCatalog } from '../server/diameter-catalog.ts';
import { hostedDataSteps } from '../server/hosted-data-steps.ts';
import { spoolTestSystemId, spoolsOfSystem } from '../shared/hydrotest.ts';

/**
 * A database in memory for the sequence of server/prepare-welding.ts: a schema that is behind until prepared, the
 * real data steps on a sample workspace, and a journal of every backup and change in the order they happen.
 */
function workspace(t: { after: (fn: () => void) => void }, { schemaBehind = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-hosted-preparation-'));
  const store = new Store(join(dir, 'test.sqlite')); seed(store);
  t.after(() => { store.close(); rmSync(dir, { recursive: true, force: true }); });
  // An older workspace: a standard defect code and a few reference diameters are missing.
  const code = store.list('ndt_defect_codes').find(row => row.system === true)!;
  store.db.prepare('DELETE FROM ndt_defect_codes WHERE id=?').run(code.id);
  for (const id of store.list('diameters').slice(0, 3).map(row => row.id)) store.db.prepare('DELETE FROM diameters WHERE id=?').run(id);
  const journal: string[] = []; let schema = !schemaBehind;
  const result = (dryRun: boolean, upToDate: boolean): PrepareResult => ({ dryRun, upToDate, created: { tables: upToDate ? [] : ['notifications'], columns: [], foreignKeys: [], indexes: [], rowLevelSecurity: [] }, columns: [], counts: {}, recordsPreserved: true } as unknown as PrepareResult);
  const parts: PreparationParts = {
    schemaUpToDate: () => schema,
    prepareSchema: ({ dryRun }) => { const before = schema; if (!dryRun && !schema) { journal.push('schema'); schema = true; } return result(dryRun, before); },
    dataSteps: [
      { name: 'catalogData', run: ({ dryRun }) => { const counts = upgradeWeldCatalogs(store, { dryRun }); if (!dryRun && Object.values(counts).some(Boolean)) journal.push('catalogData'); return counts; } },
      { name: 'diameterCatalog', run: ({ dryRun }) => { const added = dryRun ? missingDiameterCatalog(store).length : loadDiameterCatalog(store); if (!dryRun && added) journal.push('diameterCatalog'); return { added }; } },
    ],
    backup: () => { journal.push('backup'); return `backup-${journal.length}`; },
    record: () => journal.push('record'),
  };
  const digest = () => JSON.stringify(['ndt_defect_codes', 'diameters', 'qa_engineers'].map(key => store.list(key, true).map(row => [row.id, row._version])));
  return { parts, journal, digest, store };
}

test('hosted preparation: a dry run reports every step and changes nothing; a real run backs up once, then schema, then each data step', t => {
  const w = workspace(t);
  const before = w.digest();
  const dry = runHostedPreparation(w.parts, true);
  assert.equal(dry.upToDate, false); assert.equal(dry.dryRun, true);
  assert.deepEqual((dry.created as { tables: string[] }).tables, ['notifications']);
  assert.equal(dry.catalogData, SCHEMA_FIRST, 'data steps on an older schema are counted after it'); assert.equal(dry.diameterCatalog, SCHEMA_FIRST);
  assert.deepEqual(w.journal, [], 'no backup, no change'); assert.equal(w.digest(), before);
  const real = runHostedPreparation(w.parts, false);
  assert.deepEqual(w.journal, ['backup', 'schema', 'catalogData', 'diameterCatalog', 'record'], 'one backup before the first change, then the steps in order');
  assert.equal(real.backup, 'backup-1'); assert.equal((real.catalogData as { defectCodesAdded: number }).defectCodesAdded, 1); assert.deepEqual(real.diameterCatalog, { added: 3 });
  // A second run, real or dry, has nothing to do and takes no backup.
  w.journal.length = 0; const after = w.digest();
  assert.deepEqual(runHostedPreparation(w.parts, false), { upToDate: true, message: 'The hosted database is already prepared. Nothing to do; nothing was changed and no backup was needed.' });
  const again = runHostedPreparation(w.parts, true);
  assert.equal(again.upToDate, true); assert.deepEqual((again.created as { tables: string[] }).tables, []);
  assert.deepEqual(again.diameterCatalog, { added: 0 }); assert.ok(Object.values(again.catalogData as Record<string, number>).every(count => count === 0));
  assert.deepEqual(w.journal, []); assert.equal(w.digest(), after);
});

test('hosted preparation: a schema already at this release with only data pending still backs up first; nothing pending means no backup', t => {
  const w = workspace(t, { schemaBehind: false });
  const dry = runHostedPreparation(w.parts, true);
  assert.equal(dry.upToDate, false); assert.deepEqual(dry.diameterCatalog, { added: 3 }, 'counted, not added');
  assert.equal(missingDiameterCatalog(w.store).length, 3); assert.deepEqual(w.journal, []);
  runHostedPreparation(w.parts, false);
  assert.deepEqual(w.journal, ['backup', 'catalogData', 'diameterCatalog', 'record']);
  w.journal.length = 0;
  assert.equal(runHostedPreparation(w.parts, false).upToDate, true); assert.deepEqual(w.journal, []);
});

/**
 * The live workspace as the first customer has it: old sample defect codes, two of which share code + norm with a standard code
 * but carry other texts and no lock, and a QA/QC engineer saved with a company record and no Company text. The preparation
 * must only add: every stored row of every record type stays byte for byte (data, version, timestamps).
 */
test('hosted preparation on a live-like workspace: only adds, every stored record stays byte for byte, a second run adds nothing', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-hosted-additive-'));
  const store = new Store(join(dir, 'test.sqlite')); seed(store);
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Workspace</title>');
  const server = createApp(store, dir, { releaseProfile: HOSTED_RELEASE_PROFILE, distDir: dir }).listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); store.close(); rmSync(dir, { recursive: true, force: true }); });
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`; let cookie = '';
  const request = async (path: string, method = 'GET', data?: unknown) => {
    const response = await fetch(origin + path, { method, headers: { 'Content-Type': 'application/json', 'X-Stelux-Request': '1', 'X-Stelux-Pilot': 'weld', Origin: origin, ...(cookie ? { Cookie: cookie } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) });
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie')!.split(';')[0]; return response;
  };
  assert.equal((await request('/api/auth/setup', 'POST', { name: 'Upgrade admin', email: 'upgrade-admin@example.test', password: 'Upgrade-Test-Password' })).status, 201);

  // The older workspace.
  store.db.exec('DELETE FROM ndt_defect_codes');
  const old = [['401', 'Lack of fusion', 'Bindfout', 'Lack of fusion', 'ISO 6520-1'], ['IP', 'Incomplete penetration (old)', 'Onvolledig', 'Fusion', 'ASME B31.3'], ['B31-CR', 'Cracks', 'Scheuren', 'Crack', 'ASME B31.3'], ['PO', 'Porosity', 'Porositeit', 'Cavity', 'Current list']];
  const oldIds = old.map(([code, english, dutch, group, norm]) => store.create('ndt_defect_codes', { code, english, dutch, group, norm, system: false }, SYSTEM).id);
  const engineer = store.get('qa_engineers', 'qa-1'); store.update('qa_engineers', engineer.id, { company: '' }, engineer._version, SYSTEM);
  assert.equal(store.get('qa_engineers', 'qa-1').companyId, 'company-stelux');
  // Spools saved before test systems moved to spool level: no test system of their own.
  const oldSpools = store.list('spools').slice(0, 3);
  for (const spool of oldSpools) {
    const { id, _version, _archived, _createdAt, _updatedAt, testSystemId: _removed, ...data } = spool;
    store.db.prepare('UPDATE "spools" SET data=? WHERE id=?').run(JSON.stringify(data), id);
  }
  assert.ok(oldSpools.every(spool => store.get('spools', spool.id).testSystemId === undefined));
  assert.ok(oldSpools.some(spool => store.get('isometrics', spool.isoId).testSystemId), 'at least one old spool sits on an isometric with a test system');

  // Every row of every record type, as stored (the raw data text, version, archived flag and timestamps).
  const snapshot = () => new Map(RESOURCES.map(resource => [resource.key, new Map((store.db.prepare(`SELECT id, data, version, archived, created_at, updated_at FROM "${resource.key}"`).all() as { id: string }[]).map(row => [row.id, { ...row }]))]));
  const before = snapshot();
  const parts: PreparationParts = {
    schemaUpToDate: () => true,
    prepareSchema: ({ dryRun }) => ({ dryRun, upToDate: true, created: { tables: [], columns: [], foreignKeys: [], indexes: [], rowLevelSecurity: [] }, columns: [], counts: {}, recordsPreserved: true } as unknown as PrepareResult),
    // The real list of server/prepare-welding.ts.
    dataSteps: hostedDataSteps(() => store),
    backup: () => 'backup',
  };
  const missing = STANDARD_DEFECT_CODES.length - 2;

  const dry = runHostedPreparation(parts, true);
  assert.deepEqual(dry.catalogData, { defectCodesAdded: missing }, 'the dry run reports only what it would add'); assert.deepEqual(dry.diameterCatalog, { added: 0 });
  assert.deepEqual(snapshot(), before, 'a dry run changes nothing');

  const real = runHostedPreparation(parts, false);
  assert.deepEqual(real.catalogData, { defectCodesAdded: missing }); assert.equal(real.backup, 'backup');
  const after = snapshot();
  for (const [key, rows] of before) for (const [id, stored] of rows) assert.deepEqual(after.get(key)!.get(id), stored, `${key} ${id} is unchanged`);
  const added = Object.fromEntries([...after].map(([key, rows]) => [key, [...rows.keys()].filter(id => !before.get(key)!.has(id))]).filter(([, ids]) => ids.length));
  assert.deepEqual(Object.keys(added), ['ndt_defect_codes'], 'only defect codes are added');
  assert.deepEqual(new Set(added.ndt_defect_codes), new Set(STANDARD_DEFECT_CODES.filter(([code, , , , norm]) => !(code === '401' && norm === 'ISO 6520-1') && !(code === 'IP' && norm === 'ASME B31.3')).map(([code, , , , norm]) => standardDefectCodeId(code, norm))), 'the missing standard codes exist');

  // What the user sees: the matching old code is locked and refused, the engineer shows the linked company.
  const rows = ((await (await request('/api/bootstrap')).json()) as Bootstrap).rows;
  const fusion = rows.ndt_defect_codes!.find(row => row.id === oldIds[0])!;
  assert.equal(isLockedRecord('ndt_defect_codes', fusion, true), true, 'shown with the lock'); assert.equal(fusion.dutch, 'Bindfout');
  assert.equal(isLockedRecord('ndt_defect_codes', rows.ndt_defect_codes!.find(row => row.id === oldIds[2])!, true), false, 'a code of its own stays editable');
  assert.equal((await request(`/api/records/ndt_defect_codes/${fusion.id}`, 'PUT', { english: 'Other', _version: fusion._version })).status, 403);
  assert.equal((await request(`/api/records/ndt_defect_codes/${oldIds[1]}/archive`, 'POST', { _version: store.get('ndt_defect_codes', oldIds[1])._version })).status, 403);
  // The old spools are left as stored and follow their isometric's test system wherever they are read.
  for (const spool of oldSpools) {
    const shown = rows.spools!.find(row => row.id === spool.id)!, iso = rows.isometrics!.find(row => row.id === spool.isoId)!;
    assert.equal(shown.testSystemId, undefined, 'nothing written onto the spool');
    assert.equal(spoolTestSystemId(shown, iso), String(iso.testSystemId ?? ''), 'it shows its isometric\'s test system');
    if (iso.testSystemId) assert.ok(spoolsOfSystem(String(iso.testSystemId), rows).some(entry => entry.spool.id === spool.id), 'the Spools tab filter of that system lists it');
  }
  // A local start on this workspace writes nothing either.
  const beforeStart = snapshot(); seed(store); assert.deepEqual(snapshot(), beforeStart, 'start-up changes no stored row');
  const listed = rows.qa_engineers!.find((row: Row) => row.id === 'qa-1')!;
  assert.equal(listed.company, 'Stelux Engineering', 'list and form show the linked company');
  assert.equal(store.get('qa_engineers', 'qa-1').company, '', 'and nothing was written');

  // A second run adds nothing and takes no backup.
  const settled = snapshot();
  assert.equal(runHostedPreparation(parts, false).upToDate, true);
  assert.deepEqual(runHostedPreparation(parts, true).catalogData, { defectCodesAdded: 0 });
  assert.deepEqual(snapshot(), settled);
});
