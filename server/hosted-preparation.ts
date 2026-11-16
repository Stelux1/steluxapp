/**
 * The order of the hosted preparation step (server/prepare-welding.ts), kept free of the database so it can be tested:
 *
 *  1. Decide whether anything is pending: the schema (server/hosted-schema.ts) or any data step this release ships.
 *  2. Dry run: run the schema step and roll it back, count what each data step would do; nothing changes, no backup.
 *  3. Nothing pending: report it; nothing changes and no backup is taken.
 *  4. Otherwise take ONE backup before the first change, then the schema step, then each data step in order.
 *
 * Every step is idempotent, so a second real run finds nothing pending and takes no backup.
 */
import type { PrepareResult } from './hosted-schema.ts';

/**
 * A data step after the schema: counts of what it adds (all 0 when there is nothing to do). A step only inserts rows,
 * into the tables it names in `inserts` (plus one audit entry per row); it never updates or deletes a stored row,
 * counters included. The report lists those tables under `dataStepTables` (scripts/rehearse-hosted-upgrade.mjs checks them).
 */
export interface DataStep { name: string; inserts: string[]; run: (options: { dryRun: boolean }) => object }
export interface PreparationParts {
  /** Read-only: whether the schema is already at this release. */
  schemaUpToDate: () => boolean;
  /** The schema step in one transaction; a dry run rolls it back. */
  prepareSchema: (options: { dryRun: boolean }) => PrepareResult;
  /** Data steps in their order; they need the schema of this release, so they only run (or count) once it is in place. */
  dataSteps: DataStep[];
  /** Writes the backup; returns where it is. Called at most once, before the first change. */
  backup: () => string;
  /** Keeps the record of a real run next to its backup. */
  record?: (backup: string, outcome: Record<string, unknown>) => void;
}
const changes = (counts: object) => Object.values(counts).some(count => typeof count === 'number' && count > 0);
export const SCHEMA_FIRST = 'after the schema preparation';

export function runHostedPreparation(parts: PreparationParts, dryRun: boolean): Record<string, unknown> {
  const schemaUpToDate = parts.schemaUpToDate();
  // Data steps can only be counted on a schema of this release; on an older one they are pending with the schema.
  const counted = schemaUpToDate ? Object.fromEntries(parts.dataSteps.map(step => [step.name, step.run({ dryRun: true })])) : undefined;
  const pending = !schemaUpToDate || Object.values(counted!).some(changes);
  const dataStepTables = Object.fromEntries(parts.dataSteps.map(step => [step.name, step.inserts]));
  if (dryRun) {
    const schema = parts.prepareSchema({ dryRun: true });
    const data = Object.fromEntries(parts.dataSteps.map(step => [step.name, counted?.[step.name] ?? SCHEMA_FIRST]));
    return { ...schema, ...data, dataStepTables, upToDate: !pending, message: pending ? 'Dry run: the schema changes listed under "created" were applied and rolled back, the data steps were counted. Nothing was changed and no backup was written.' : 'Dry run: the hosted database is already prepared. Nothing to do.' };
  }
  if (!pending) return { upToDate: true, message: 'The hosted database is already prepared. Nothing to do; nothing was changed and no backup was needed.' };
  const backup = parts.backup();
  const schema = parts.prepareSchema({ dryRun: false });
  const data = Object.fromEntries(parts.dataSteps.map(step => [step.name, step.run({ dryRun: false })]));
  const outcome = { backup, ...schema, ...data, dataStepTables, upToDate: false };
  parts.record?.(backup, outcome);
  return outcome;
}
