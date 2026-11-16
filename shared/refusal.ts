/**
 * What the user is told when the server refuses. Pure, so the server handler and the tests share one rule set.
 * A refusal raised by a rule keeps its own sentence and field hints; only a version conflict or a blocked delete
 * gets the generic sentence; nothing internal (SQL, constraint names, stack text) is ever sent.
 */
export const REFUSAL_TEXTS = {
  conflict: 'This record is in use or has changed. Refresh and check its linked records.',
  check: 'Please check the record and try again.',
  neutral: 'The request could not be completed. Check your entries and try again.',
  failed: 'Something went wrong. Your changes were not saved.',
  sessionEnded: 'Your session has ended. Sign in again.',
  unreachable: 'The server could not be reached. Try again.',
} as const;

/** Text that only a developer should read: SQL, constraint or index names, column errors, stack lines, parser messages. */
const INTERNAL = /SQLITE_|\bUNIQUE constraint|\bFOREIGN KEY|\bNOT NULL constraint|\bCHECK constraint|\bconstraint\b|_unique_|\bviolates\b|\bsyntax error\b|no such (?:table|column)|\bcolumn "|\brelation "|json_extract|\bSELECT\b[^.]*\bFROM\b|\bINSERT INTO\b|\bDELETE FROM\b|\bUPDATE\s+\S+\s+SET\b|\bat \S+ \(.*:\d+:\d+\)|\.(?:ts|js|mjs):\d+|node_modules|\bUnexpected token\b|\bis not valid JSON\b|\[object |\bundefined\b/;
export const internalText = (text: unknown) => typeof text === 'string' && INTERNAL.test(text);

export interface Refusal { status: number; message: string; fields?: Record<string, string>; code?: string; kind?: 'conflict' | 'duplicate' }
export interface RefusalOptions {
  /** The hosted profile shows the generic sentence for conflicts. */
  hosted: boolean;
  /** Record routes: only delivered fields may be named. Left out on action routes, whose hints name the dialog's own fields. */
  deliver?: (field: string) => boolean;
}

export function refusalBody(error: Refusal, { hosted, deliver }: RefusalOptions): { status: number; body: { error: string; fields?: Record<string, string>; code?: string } } {
  const code = error.code && /^[a-z-]{1,24}$/.test(error.code) ? { code: error.code } : {};
  if (error.status >= 500) return { status: error.status, body: { error: REFUSAL_TEXTS.failed } };
  const fields = error.fields ? Object.fromEntries(Object.entries(error.fields).filter(([name, hint]) => (!deliver || deliver(name)) && !internalText(hint))) : undefined;
  const named = fields && Object.keys(fields).length ? { fields } : {};
  let message = error.message;
  if (internalText(message)) message = REFUSAL_TEXTS.neutral;
  else if (hosted && error.status === 409 && error.kind === 'conflict') message = REFUSAL_TEXTS.conflict;
  else if (hosted && deliver && error.fields && error.kind !== 'duplicate' && !Object.keys(fields || {}).length) message = REFUSAL_TEXTS.check;
  return { status: error.status, body: { error: message, ...named, ...code } };
}
