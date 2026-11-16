import { splitPilotPath } from '../shared/release.ts';
import { REFUSAL_TEXTS, internalText } from '../shared/refusal.ts';

export class ApiError extends Error {
  /** `code` is `pilot` when the server refuses the current pilot (or a workspace request without one). */
  constructor(message: string, public status: number, public fields?: Record<string, string>, public code?: string) { super(message); }
}
let pilotRequests = false;
/** Where the profile delivers pilots, every request names the pilot of the current URL (`/weld/…`, `/mto/…`). */
export function configurePilotRequests(enabled: boolean) { pilotRequests = enabled; }
/** The pilot of the current URL, if requests carry one. */
export const currentPilot = () => pilotRequests ? splitPilotPath(window.location.pathname).pilot : undefined;
let activeSite = '';
/**
 * THE active main project of this tab, sent with every pilot request (`X-Stelux-Site`, `?site=` on plain links): an
 * account limited to specific project sites works with that main project's profile (server/site-scope.ts `activeSite`).
 * Set by the workspace (client/context.tsx) whenever the main project changes; '' while none is chosen.
 */
export function configureActiveSite(siteId: string) { activeSite = siteId; }
export const currentSite = () => pilotRequests ? activeSite : '';
/** An API URL for a plain link or image (downloads cannot send headers): carries the current pilot as `?pilot=` and the main project as `?site=`. */
export function apiUrl(path: string) { const pilot = currentPilot(), site = pilot ? currentSite() : ''; const query = [pilot ? `pilot=${pilot}` : '', site ? `site=${encodeURIComponent(site)}` : ''].filter(Boolean).join('&'); return `/api${path}${query ? `${path.includes('?') ? '&' : '?'}${query}` : ''}`; }
async function request(url: string, options: RequestInit = {}) {
  const pilot = currentPilot(), site = pilot ? currentSite() : '';
  try { return await fetch('/api' + url, { credentials: 'same-origin', ...options, headers: { ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), 'X-Stelux-Request': '1', ...(pilot ? { 'X-Stelux-Pilot': pilot } : {}), ...(site ? { 'X-Stelux-Site': site } : {}), ...options.headers } }); }
  catch { throw new ApiError(REFUSAL_TEXTS.unreachable, 0); }
}
/** The page listens for this to return to the sign-in form with one sentence. */
export const SESSION_ENDED = 'blitzkrieg:session-ended';
/** The body of an answer as an object; an answer that is not JSON (gateway page, server down) is never shown as parser text. */
async function readBody(response: Response): Promise<Record<string, any> | undefined> {
  try { const body = await response.json(); return body && typeof body === 'object' ? body : undefined; } catch { return undefined; }
}
/** The sentence for a refused answer: the server's own sentence when it sent one, otherwise a plain one. */
function refusal(response: Response, body: Record<string, any> | undefined, fallback: string, url: string) {
  if (response.status === 401 && !url.startsWith('/auth/')) { if (typeof window !== 'undefined') window.dispatchEvent(new Event(SESSION_ENDED)); return new ApiError(REFUSAL_TEXTS.sessionEnded, 401, undefined, body?.code); }
  const sentence = typeof body?.error === 'string' && body.error && !internalText(body.error) ? body.error : response.status >= 500 || !body ? REFUSAL_TEXTS.unreachable : fallback;
  return new ApiError(sentence, response.status, body?.fields, body?.code);
}
export async function api<T = Record<string, unknown>>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await request(url, options);
  const body = await readBody(response);
  if (!response.ok) throw refusal(response, body, 'The request failed.', url);
  if (!body) throw new ApiError(REFUSAL_TEXTS.unreachable, response.status);
  return body as T;
}
/** A file the account may read, as a blob (e.g. an image preview), requested with the current pilot. */
export async function apiBlob(url: string, options: RequestInit = {}): Promise<Blob> {
  const response = await request(url, options);
  if (!response.ok) throw refusal(response, await readBody(response), 'The file could not be loaded.', url);
  return response.blob();
}
export const post = <T = Record<string, unknown>>(url: string, body: unknown) => api<T>(url, { method: 'POST', body: JSON.stringify(body) });
export const formatNumber = (n: unknown, digits = 1) => Number(n || 0).toLocaleString('en-GB', { maximumFractionDigits: digits });
export const formatDate = (date: unknown) => { if (!date) return '—'; const raw = String(date).slice(0, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return String(date); return raw.split('-').reverse().join('.'); };
