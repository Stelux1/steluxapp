import { splitPilotPath } from '../shared/release.ts';

export class ApiError extends Error {
  /** `code` is `pilot` when the server refuses the current pilot (or a workspace request without one). */
  constructor(message: string, public status: number, public fields?: Record<string, string>, public code?: string) { super(message); }
}
let pilotRequests = false;
/** Where the profile delivers pilots, every request names the pilot of the current URL (`/weld/…`, `/mto/…`). */
export function configurePilotRequests(enabled: boolean) { pilotRequests = enabled; }
/** The pilot of the current URL, if requests carry one. */
export const currentPilot = () => pilotRequests ? splitPilotPath(window.location.pathname).pilot : undefined;
/** An API URL for a plain link or image (downloads cannot send headers): carries the current pilot as `?pilot=`. */
export function apiUrl(path: string) { const pilot = currentPilot(); return `/api${path}${pilot ? `${path.includes('?') ? '&' : '?'}pilot=${pilot}` : ''}`; }
async function request(url: string, options: RequestInit = {}) {
  const pilot = currentPilot();
  return fetch('/api' + url, { credentials: 'same-origin', ...options, headers: { ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), 'X-Stelux-Request': '1', ...(pilot ? { 'X-Stelux-Pilot': pilot } : {}), ...options.headers } });
}
export async function api<T = Record<string, unknown>>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await request(url, options);
  const body = await response.json();
  if (!response.ok) throw new ApiError(body.error || 'The request failed.', response.status, body.fields, body.code);
  return body;
}
/** A file the account may read, as a blob (e.g. an image preview), requested with the current pilot. */
export async function apiBlob(url: string): Promise<Blob> {
  const response = await request(url);
  if (!response.ok) { const body = await response.json().catch(() => ({})); throw new ApiError(body.error || 'The file could not be loaded.', response.status, body.fields, body.code); }
  return response.blob();
}
export const post = <T = Record<string, unknown>>(url: string, body: unknown) => api<T>(url, { method: 'POST', body: JSON.stringify(body) });
export const formatNumber = (n: unknown, digits = 1) => Number(n || 0).toLocaleString('en-GB', { maximumFractionDigits: digits });
export const formatDate = (date: unknown) => { if (!date) return '—'; const raw = String(date).slice(0, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return String(date); return raw.split('-').reverse().join('.'); };
