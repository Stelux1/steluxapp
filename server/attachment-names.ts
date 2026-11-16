import { ATTACHMENT_SORT_MODES, attachmentOrderField, reorderedAttachmentIds, type AttachmentSortMode } from '../shared/weld-catalogs.ts';
import type { Row } from '../shared/types.ts';
import { AppError, type Actor, type Store } from './store.ts';

/**
 * Attachment names → Sorting: saves the order of one mode ("ISO book" or "Hydrotest") as 1..n on the rows of that mode.
 * The two modes keep separate numbers, so sorting one never moves the other. Runs inside the action's transaction.
 */
export function reorderAttachmentNames(store: Store, data: Record<string, unknown>, actor: Actor): { resource: string; record?: Row; records?: Row[] } {
  const mode = data.mode as AttachmentSortMode;
  if (!ATTACHMENT_SORT_MODES.includes(mode)) throw new AppError(422, 'Choose ISO book or Hydrotest.', { mode: 'Choose a sorting.' });
  const order = reorderedAttachmentIds(store.list('attachment_names'), mode, data.order);
  if (!order) throw new AppError(422, 'The order contains a document that cannot be sorted here.', { order: 'Reload the page and try again.' });
  const field = attachmentOrderField(mode);
  const records = order.map((id, index) => {
    const row = store.get('attachment_names', id);
    return row[field] === index + 1 ? row : store.update('attachment_names', id, { [field]: index + 1 }, row._version, actor);
  });
  return { resource: 'attachment_names', records };
}
