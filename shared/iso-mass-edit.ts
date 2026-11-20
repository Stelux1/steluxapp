import type { Field, Value } from './types.ts';
import { priorityStored } from './priority.ts';

/**
 * Mass edit of isometrics (Iso overview → Options → Mass edit): every editable input field of the isometric form at once, all
 * empty; only the fields the user filled are sent, an empty field keeps each isometric's own value.
 * Left out: the fields the server refuses to bulk edit (X-ray %, the test system and the ITP links), the sub-project (moving an
 * isometric is not a mass edit), the ISO number (unique within a sub-project), the phase flags (the "Set phase" dialog owns them)
 * and every hidden or read-only field.
 */
export const ISO_MASS_EDIT_EXCLUDED = ['isoNo', 'projectId', 'xRay', 'itpId', 'itp2Id', 'testSystemId'];
export const ISO_MASS_EDIT_KEEP = 'Keep current';
export const isoMassEditSubtitle = (count: number) => `Only filled fields are changed on the ${count} checked ${count === 1 ? 'isometric' : 'isometrics'}. Empty fields keep their current values.`;

export function isoMassEditFields(fields: Field[]): Field[] {
  return fields.filter(field => field.type !== 'password' && !field.hidden && !field.readonly && !ISO_MASS_EDIT_EXCLUDED.includes(field.name) && field.section !== 'Phases');
}
/** The values typed in the dialog: a text for every field, 'yes' / 'no' / '' for a flag. */
export type IsoMassValues = Record<string, unknown>;
const filled = (value: unknown) => value !== undefined && value !== null && String(value).trim() !== '';
/** Only the filled fields, typed for the server: flags as true / false, numbers as numbers, the "No priority" option as the stored empty value. */
export function isoMassEditChanges(fields: Field[], values: IsoMassValues): Record<string, Value> {
  const changes: Record<string, Value> = {};
  for (const field of isoMassEditFields(fields)) {
    const value = values[field.name];
    if (!filled(value)) continue;
    if (field.type === 'checkbox') { if (value === 'yes' || value === true) changes[field.name] = true; else if (value === 'no' || value === false) changes[field.name] = false; }
    else if (field.type === 'number') { const number = Number(String(value).replace(',', '.')); if (Number.isFinite(number)) changes[field.name] = number; }
    else if (field.name === 'priority') changes[field.name] = priorityStored(String(value));
    else changes[field.name] = typeof value === 'string' ? value.trim() : value as Value;
  }
  return changes;
}
