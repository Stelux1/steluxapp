/**
 * Isometric priority. The reference offers "No priority" and Prio 1 … Prio 5; earlier versions of this
 * workspace stored Low / Normal / High / Critical. Nothing is rewritten in bulk: stored rows keep whatever they
 * hold, are mapped when displayed or filtered, and receive the new value only when a user saves the field.
 *
 *   Critical -> Prio 1    High -> Prio 2    Normal -> Prio 3    Low -> Prio 4    empty -> No priority
 *
 * Reversible: the mapping is one-to-one on the old values, so removing it later restores the old display.
 */
export const NO_PRIORITY = 'No priority';
export const PRIORITY_OPTIONS = [NO_PRIORITY, 'Prio 1', 'Prio 2', 'Prio 3', 'Prio 4', 'Prio 5'];
/** Stored value -> the option it stands for. The empty string is stored for "No priority". */
export const LEGACY_PRIORITY: Record<string, string> = { '': NO_PRIORITY, Critical: 'Prio 1', High: 'Prio 2', Normal: 'Prio 3', Low: 'Prio 4' };

/** The option a stored value stands for (old values mapped, empty -> No priority). */
export function priorityLabel(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : '';
  return LEGACY_PRIORITY[text] ?? text;
}
/** The isometrics list cell (reference renderer): "Prio 3" → "P3", no priority → "-". */
export function priorityShort(value: unknown): string {
  const match = /^Prio (\d+)$/.exec(priorityLabel(value));
  return match && Number(match[1]) > 0 ? `P${match[1]}` : '-';
}
/** What a select stores for an option: "No priority" is stored as the empty value. */
export const priorityStored = (option: string) => option === NO_PRIORITY ? '' : option;
