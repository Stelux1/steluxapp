import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runHostedPreparation, SCHEMA_FIRST, type PreparationParts } from '../server/hosted-preparation.ts';
import type { PrepareResult } from '../server/hosted-schema.ts';
import { Store } from '../server/store.ts';
import { seed } from '../server/seed.ts';
import { upgradeWeldCatalogs } from '../server/catalog-upgrade.ts';
import { loadDiameterCatalog, missingDiameterCatalog } from '../server/diameter-catalog.ts';

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
