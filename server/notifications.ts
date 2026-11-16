import { NOTIFICATION_LIMIT, notificationView, safeNotificationLink, unreadNotifications, visibleNotifications } from '../shared/notifications.ts';
import type { PilotKey } from '../shared/release.ts';
import type { Row } from '../shared/types.ts';
import { AppError, SYSTEM, type Store } from './store.ts';

/**
 * Notifications of the bell (hosted profile). Every function takes the account it acts for; a notification of another
 * account, of another pilot, or of a main project the account may not reach is never returned, counted or changed.
 */
export interface NotificationInput { userId: string; pilot: PilotKey; kind: string; title: string; message?: string; link?: string; siteId?: string; resource?: string; recordId?: string }
export function addNotification(store: Store, input: NotificationInput) {
  return store.create('notifications', { ...input, link: safeNotificationLink(input.link), message: input.message ?? '', siteId: input.siteId ?? '', resource: input.resource ?? '', recordId: input.recordId ?? '', read: false, readAt: '' }, SYSTEM);
}

export interface Viewer { id: string; pilot: string; canSee: (row: Row) => boolean }
const own = (store: Store, viewer: Viewer) => visibleNotifications(store.list('notifications'), { userId: viewer.id, pilot: viewer.pilot, canSee: viewer.canSee });
/** What the bell shows: the unread count of everything the account can see, and the newest 15. */
export function bellOf(store: Store, viewer: Viewer) {
  const visible = own(store, viewer);
  return { unread: unreadNotifications(visible), notifications: visible.slice(0, NOTIFICATION_LIMIT).map(notificationView) };
}
export function markRead(store: Store, viewer: Viewer, id: string) {
  const row = own(store, viewer).find(item => item.id === id);
  if (!row) throw new AppError(404, 'This notification could not be found.');
  if (row.read !== true) store.update('notifications', row.id, { read: true, readAt: new Date().toISOString() }, row._version, SYSTEM);
  return bellOf(store, viewer);
}
export function markAllRead(store: Store, viewer: Viewer) {
  store.transaction(() => { for (const row of own(store, viewer)) if (row.read !== true) store.update('notifications', row.id, { read: true, readAt: new Date().toISOString() }, row._version, SYSTEM); });
  return bellOf(store, viewer);
}
