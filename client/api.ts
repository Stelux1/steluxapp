export class ApiError extends Error {
  constructor(message: string, public status: number, public fields?: Record<string, string>) { super(message); }
}
export async function api<T = Record<string, unknown>>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch('/api' + url, { credentials: 'same-origin', ...options, headers: { ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), 'X-Stelux-Request': '1', ...options.headers } });
  const body = await response.json();
  if (!response.ok) throw new ApiError(body.error || 'The request failed.', response.status, body.fields);
  return body;
}
export const post = <T = Record<string, unknown>>(url: string, body: unknown) => api<T>(url, { method: 'POST', body: JSON.stringify(body) });
export const formatNumber = (n: unknown, digits = 1) => Number(n || 0).toLocaleString('en-GB', { maximumFractionDigits: digits });
export const formatDate = (date: unknown) => { if (!date) return '—'; const raw = String(date).slice(0, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return String(date); return raw.split('-').reverse().join('.'); };
