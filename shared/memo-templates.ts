import type { Field, Resource, Row } from './types.ts';

/**
 * Memo templates (reference: Edit project site → "Memo templates", and the "Instructions for field personnel" field of
 * Edit isometric with its template buttons; captures weld__general__project-sites__edit-zandbak.txt:291-323,
 * weld__iso__0001__edit-isometric.txt:113-129, script weld__start__dashboard.txt:6750-6890).
 *
 * Global templates apply to every project site. A project site keeps its own rows: a copy of a global under the same key
 * (it replaces that global for this site only) or a template of its own. Saving a global from a site always writes the
 * site's copy; the global itself never changes from a site. "Restore default" and "Delete" archive the site's row.
 *
 * The six globals are the reference's (their texts are the captured `data-html`); they are part of the release, so no
 * data step has to insert them. Stored rows with scope "global" (none are written by this release) would replace a
 * built-in global of the same key.
 */
export const MEMO_TEMPLATES = 'iso_memo_templates';
export const MEMO_SCOPES = ['global', 'site'] as const;
export type MemoScope = typeof MEMO_SCOPES[number];
/** Who may change a site's templates: the right to edit the project site (area 4, as the reference's dialog). */
export const MEMO_TEMPLATE_SCOPES: Record<string, string[]> = { [MEMO_TEMPLATES]: ['4'] };

export const MEMO_LIMITS = { label: 100, key: 50, content: 5000, sortOrder: 100000 };
export const MEMO_DEFAULT_SORT = 100;
export const MEMO_TEXTS = {
  tab: 'Memo templates',
  intro: 'Customize standard texts for this project site or add new templates. Global templates apply everywhere; site templates override or extend them.',
  columns: ['Button label', 'Key', 'Sort order'],
  global: 'Global', site: 'Site',
  add: 'New template', editor: 'Isometric memo templates',
  label: 'Button label', key: 'Key', keyPlaceholder: 'prefab, ndt, ...', sortOrder: 'Sort order', content: 'Content',
  contentHint: 'One line per paragraph; start a line with "- " for a list item.',
  save: 'Save', cancel: 'Cancel', restore: 'Restore default', saveForSite: 'Save for this site', remove: 'Delete',
  confirmDelete: 'Delete template?', confirmRestore: 'Remove the site customisation and restore the default?',
  contentRequired: 'Content is required.', labelRequired: 'Button label is required.',
  saved: 'Saved', deleted: 'Deleted', restored: 'Restored',
  // Isometric side
  help: 'Pick a template to add standard steps quickly. Then adjust for this isometric.',
  templates: 'Templates', append: 'Append', replace: 'Replace',
  empty: 'No templates yet.',
};

/** The reference's global templates (capture weld__general__project-sites__edit-zandbak.txt:295-300), in sort order. */
export const BUILTIN_MEMO_TEMPLATES: { id: string; key: string; label: string; sortOrder: number; html: string }[] = [
  { id: 'memo-global-prefab', key: 'prefab', label: 'Prefab', sortOrder: 10, html: '<p><strong>Prefab</strong></p><ul><li>Check material and fit-up before welding.</li><li>Perform shop welds per WPS.</li><li>Mark spools and line after completion.</li></ul>' },
  { id: 'memo-global-field', key: 'field', label: 'Field install', sortOrder: 20, html: '<p><strong>Field installation</strong></p><ul><li>Check supports and alignment.</li><li>Perform field welds per WPS.</li><li>Update weld status and NDT requests.</li></ul>' },
  { id: 'memo-global-ndt', key: 'ndt', label: 'NDT / inspection', sortOrder: 30, html: '<p><strong>NDT / inspection</strong></p><ul><li>Visual inspection before NDT where applicable.</li><li>NDT only after release / fit-up OK.</li><li>Process results before next work.</li></ul>' },
  { id: 'memo-global-hydro', key: 'hydro', label: 'Pressure test', sortOrder: 40, html: '<p><strong>Pressure / hydro test</strong></p><ul><li>Isolate systems per test plan.</li><li>Verify test medium, pressure and hold time.</li><li>Document result and punch items.</li></ul>' },
  { id: 'memo-global-safety', key: 'safety', label: 'Safety', sortOrder: 50, html: '<p><strong>Safety</strong></p><ul><li>Work permit / LMRA applies.</li><li>PPE mandatory in work area.</li><li>Stop on deviation or unsafe situation.</li></ul>' },
  { id: 'memo-global-finish', key: 'finish', label: 'Finishing', sortOrder: 60, html: '<p><strong>Finishing</strong></p><ul><li>Coating / insulation per spec.</li><li>Protect piping during transport.</li><li>Complete handover documentation.</li></ul>' },
];

/** The record type (server/hosted-schema.ts creates its table from this definition). Written only by server/memo-templates.ts. */
export const MEMO_TEMPLATE_RESOURCE: Resource = {
  key: MEMO_TEMPLATES, title: 'Memo templates', singular: 'memo template', module: 'general', group: 'Workspace',
  description: 'Standard texts for the instructions of an isometric, per project site.',
  fields: [
    { name: 'label', label: 'Button label', type: 'text', required: true },
    { name: 'scope', label: 'Scope', type: 'select', options: [...MEMO_SCOPES], default: 'site', required: true },
    { name: 'siteId', label: 'Project site', type: 'ref', ref: 'sites' },
    { name: 'key', label: 'Key', type: 'text' },
    { name: 'sortOrder', label: 'Sort order', type: 'number', default: MEMO_DEFAULT_SORT },
    { name: 'content', label: 'Content', type: 'textarea', required: true },
  ] as Field[],
  columns: ['label', 'key', 'sortOrder'], display: 'label', readonly: true,
};

const decode = (value: string) => value.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
/** The plain text of a template's HTML: one line per paragraph, "- " before each list item. Tags are dropped, never rendered. */
export function memoText(html: string): string {
  const lines = String(html)
    .replace(/<li[^>]*>/gi, '\n- ').replace(/<\/(p|li|ul|ol|div|h\d)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '').split('\n').map(line => decode(line).replace(/\s+/g, ' ').trim()).filter(Boolean);
  return lines.join('\n');
}

export interface MemoTemplate {
  /** The record id (a built-in global has its fixed id). */
  id: string; scope: MemoScope; key: string; label: string; sortOrder: number; content: string;
  /** A site row whose key is a global's: it replaces that global for this site. */
  overridesGlobal: boolean;
}
const text = (value: unknown) => typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '';
const sortNumber = (value: unknown) => { const number = Number(value); return value === '' || value === null || value === undefined || !Number.isFinite(number) ? MEMO_DEFAULT_SORT : number; };
const sameKey = (a: string, b: string) => Boolean(a) && a.toLowerCase() === b.toLowerCase();
const bySort = (a: MemoTemplate, b: MemoTemplate) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, 'en', { numeric: true }) || a.id.localeCompare(b.id);
const live = (rows: Row[]) => rows.filter(row => !row._archived);

/** The global templates: the built-in ones, each replaced by a stored global row of the same key, plus other stored globals. */
export function globalMemoTemplates(rows: Row[]): MemoTemplate[] {
  const stored = live(rows).filter(row => row.scope === 'global').map(row => fromRow(row, false));
  const builtin = BUILTIN_MEMO_TEMPLATES.map(item => stored.find(row => sameKey(row.key, item.key)) ?? { id: item.id, scope: 'global' as const, key: item.key, label: item.label, sortOrder: item.sortOrder, content: memoText(item.html), overridesGlobal: false });
  return [...builtin, ...stored.filter(row => !builtin.includes(row))].sort(bySort);
}
function fromRow(row: Row, overridesGlobal: boolean): MemoTemplate {
  return { id: row.id, scope: row.scope === 'global' ? 'global' : 'site', key: text(row.key), label: text(row.label), sortOrder: sortNumber(row.sortOrder), content: String(row.content ?? ''), overridesGlobal };
}
/** The live site rows of one project site. */
export const siteMemoRows = (rows: Row[], siteId: string) => live(rows).filter(row => row.scope !== 'global' && row.siteId === siteId);

/**
 * The templates a project site works with, in sort order: every global, replaced by the site's row of the same key,
 * plus the site's own templates. This is the list of the site tab and of the isometric's template buttons.
 */
export function effectiveMemoTemplates(rows: Row[], siteId: string): MemoTemplate[] {
  const globals = globalMemoTemplates(rows), own = siteMemoRows(rows, siteId);
  const replaced = globals.map(global => { const copy = own.find(row => sameKey(text(row.key), global.key)); return copy ? fromRow(copy, true) : global; });
  const extra = own.filter(row => !globals.some(global => sameKey(text(row.key), global.key))).map(row => fromRow(row, false));
  return [...replaced, ...extra].sort(bySort);
}

/** The buttons of the template editor (reference script :6784-6786): Delete for a saved site row, Restore default for a site row with a key, Save for this site for a global. */
export function memoEditorButtons(template: Pick<MemoTemplate, 'scope' | 'key'> & { id?: string }) {
  return { remove: template.scope === 'site' && Boolean(template.id), restore: template.scope === 'site' && Boolean(template.key), saveForSite: template.scope === 'global' && Boolean(template.id), keyReadonly: template.scope === 'global' && Boolean(template.id) };
}

export interface MemoSaveInput { recordId?: unknown; label?: unknown; key?: unknown; sortOrder?: unknown; content?: unknown }
export interface MemoSavePlan {
  /** `update` changes the site row `id`; `create` adds a site row. */
  kind: 'create' | 'update'; id?: string;
  values: { scope: 'site'; siteId: string; key: string; label: string; sortOrder: number; content: string };
}
export class MemoInputError extends Error { constructor(message: string, readonly fields: Record<string, string>, readonly status = 422) { super(message); } }

/**
 * What a Save does (pure; the server runs it inside its transaction). Saving a global writes the site's copy under the
 * global's key (updating the copy when it exists); saving a site row updates it; without a record a new site template
 * is added. A key is unique among the site's own templates.
 */
export function planMemoSave(rows: Row[], siteId: string, input: MemoSaveInput): MemoSavePlan {
  const errors: Record<string, string> = {};
  const label = text(input.label), content = String(input.content ?? '').replace(/\r\n?/g, '\n').trim(), sortRaw = input.sortOrder;
  if (!label) errors.label = MEMO_TEXTS.labelRequired; else if (label.length > MEMO_LIMITS.label) errors.label = `Use at most ${MEMO_LIMITS.label} characters.`;
  if (!content) errors.content = MEMO_TEXTS.contentRequired; else if (content.length > MEMO_LIMITS.content) errors.content = `Use at most ${MEMO_LIMITS.content} characters.`;
  const sortOrder = sortNumber(sortRaw);
  if (sortRaw !== '' && sortRaw !== null && sortRaw !== undefined && (!Number.isFinite(Number(sortRaw)) || Number(sortRaw) < 0 || Number(sortRaw) > MEMO_LIMITS.sortOrder)) errors.sortOrder = `Enter a number from 0 to ${MEMO_LIMITS.sortOrder}.`;
  const recordId = text(input.recordId);
  const globals = globalMemoTemplates(rows), own = siteMemoRows(rows, siteId);
  const global = recordId ? globals.find(item => item.id === recordId) : undefined;
  const mine = recordId && !global ? own.find(row => row.id === recordId) : undefined;
  if (recordId && !global && !mine) throw new MemoInputError('This template no longer exists. Close the editor and try again.', {}, 404);
  // A global keeps its key (read-only in the editor); a site row may change its key.
  const key = global ? global.key : text(input.key);
  if (key.length > MEMO_LIMITS.key) errors.key = `Use at most ${MEMO_LIMITS.key} characters.`;
  const copy = global ? own.find(row => sameKey(text(row.key), global.key)) : undefined;
  if (!global && key && own.some(row => row.id !== mine?.id && sameKey(text(row.key), key))) errors.key = 'This project site already has a template with this key.';
  if (Object.keys(errors).length) throw new MemoInputError(errors.content && Object.keys(errors).length === 1 ? errors.content : 'Please check the highlighted fields.', errors);
  const values = { scope: 'site' as const, siteId, key, label, sortOrder, content };
  if (global) return copy ? { kind: 'update', id: copy.id, values } : { kind: 'create', values };
  // A new template under a global's key becomes that site's copy of the global (effectiveMemoTemplates).
  return mine ? { kind: 'update', id: mine.id, values } : { kind: 'create', values };
}
/** Delete: the site row `recordId` of this site (archived, never removed). */
export function memoDeleteTarget(rows: Row[], siteId: string, recordId: unknown): Row {
  const row = siteMemoRows(rows, siteId).find(item => item.id === text(recordId));
  if (row) return row;
  if (globalMemoTemplates(rows).some(item => item.id === text(recordId))) throw new MemoInputError('A global template cannot be deleted from a project site.', {});
  throw new MemoInputError('This template no longer exists.', {}, 404);
}
/** Restore default: every site row of this site under `key` (archived), so the global of that key applies again. */
export function memoRestoreTargets(rows: Row[], siteId: string, key: unknown): Row[] {
  const wanted = text(key);
  if (!wanted) throw new MemoInputError('Choose a template with a key.', {});
  return siteMemoRows(rows, siteId).filter(row => sameKey(text(row.key), wanted));
}

export type MemoInsertMode = 'append' | 'replace';
/** A template button on the isometric memo: Append (default) adds the text after a blank line, Replace puts it in place of the memo. */
export function insertMemoTemplate(memo: unknown, content: string, mode: MemoInsertMode = 'append'): string {
  const current = String(memo ?? '').replace(/\s+$/, '');
  return mode === 'replace' || !current ? content : `${current}\n\n${content}`;
}
