import type { Row } from './types.ts';

/**
 * Personal notifications (the bell): one record per account and event. A notification belongs to exactly one account,
 * one pilot and, where it concerns a main project, that main project. Every read and write goes through the server
 * routes, which apply `visibleNotifications` for the requesting account; the generic record routes do not deliver them.
 */
export const NOTIFICATION_KINDS = ['transfer-order', 'release', 'general'];
/** The bell lists the newest 15 (the reference asks for 15). */
export const NOTIFICATION_LIMIT = 15;
export const NO_NOTIFICATIONS = 'No notifications';

export interface NotificationContext {
  userId: string;
  pilot: string;
  /** Whether the account may still see the record behind the notification (its permission and main project scope today). */
  canSee: (row: Row) => boolean;
}
/** The notifications one account sees in one pilot, newest first. Anything of another account, another pilot or out of reach is left out. */
export function visibleNotifications(rows: Row[], context: NotificationContext): Row[] {
  return rows.filter(row => !row._archived && row.userId === context.userId && row.pilot === context.pilot && context.canSee(row))
    .sort((a, b) => String(b._createdAt).localeCompare(String(a._createdAt)) || b.id.localeCompare(a.id));
}
export const unreadNotifications = (rows: Row[]) => rows.filter(row => row.read !== true).length;
export interface NotificationView { id: string; kind: string; title: string; message: string; link: string; read: boolean; createdAt: string }
export const notificationView = (row: Row): NotificationView => ({ id: row.id, kind: String(row.kind ?? 'general'), title: String(row.title ?? ''), message: String(row.message ?? ''), link: String(row.link ?? ''), read: row.read === true, createdAt: row._createdAt });
/** A link stays inside the workspace: a path of a pilot page, never another site. */
export const safeNotificationLink = (value: unknown) => typeof value === 'string' && /^\/[A-Za-z0-9_\-/?=&.%]*$/.test(value) && !value.startsWith('//') ? value : '';
