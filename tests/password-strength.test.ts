import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Store } from '../server/store.ts';
import { seed } from '../server/seed.ts';
import { createApp } from '../server/http.ts';
import { HOSTED_RELEASE_PROFILE, type ReleaseProfile } from '../shared/release.ts';
import { REFERENCE_PASSWORD_LABELS, referencePasswordAccepted, referencePasswordLabel, referencePasswordScore } from '../shared/password-strength.ts';
import { PasswordStrengthMeter } from '../client/shell-parts.tsx';

// access-users-profiles-R1: the Change password strength meter of the reference (weld__start__dashboard.txt, script wsapps_pwStrengthBar).
test('the strength score of the reference: Abcdef12 is OK, aaaaaaaaaa is refused, 13 lower-case letters are OK', () => {
  assert.equal(referencePasswordScore(''), 0); assert.equal(referencePasswordScore('abc'), 1);
  assert.equal(referencePasswordScore('Abcdef12'), 5); assert.ok(referencePasswordAccepted('Abcdef12'));
  assert.equal(referencePasswordScore('aaaaaaaaaa'), 4); assert.equal(referencePasswordAccepted('aaaaaaaaaa'), false);
  assert.equal(referencePasswordScore('abcdefghijklm'), 5); assert.ok(referencePasswordAccepted('abcdefghijklm'));
  assert.equal(referencePasswordScore('Tr0ub4dor&3-horse-staple'), 8, 'capped at 8');
  assert.deepEqual([6, 7].map(score => REFERENCE_PASSWORD_LABELS[score]), ['Good', 'Strong']);
  assert.equal(REFERENCE_PASSWORD_LABELS[5], 'OK'); assert.equal(REFERENCE_PASSWORD_LABELS[8], 'Very strong');
  assert.ok(REFERENCE_PASSWORD_LABELS.slice(0, 5).every(label => label === 'Password too weak. Use at least 8 characters with uppercase, lowercase, numbers and special characters.'));
  assert.equal(referencePasswordLabel(''), ''); assert.equal(referencePasswordLabel('Abcdef12'), 'OK');
  assert.equal(referencePasswordAccepted(12345678901234 as unknown), false);
});

test('the meter shows the reference text and a bar that grows with the score', () => {
  const weak = renderToStaticMarkup(createElement(PasswordStrengthMeter, { password: 'aaaaaaaaaa' }));
  assert.match(weak, /Password strength/); assert.match(weak, /Password too weak\. Use at least 8 characters/); assert.match(weak, /width:50%/);
  const fine = renderToStaticMarkup(createElement(PasswordStrengthMeter, { password: 'Abcdef12' }));
  assert.match(fine, />OK</); assert.match(fine, /level-2/); assert.match(fine, /width:63%/);
  assert.match(renderToStaticMarkup(createElement(PasswordStrengthMeter, { password: 'Tr0ub4dor&3-horse-staple' })), /Very strong/);
});

async function server(t: { after: (fn: () => Promise<void>) => void }, releaseProfile: ReleaseProfile) {
  const dir = mkdtempSync(join(tmpdir(), 'blitzkrieg-password-'));
  const store = new Store(join(dir, 'test.sqlite')); seed(store);
  const app = createApp(store, dir, { releaseProfile, serveClient: false }).listen(0, '127.0.0.1'); await once(app, 'listening');
  const origin = `http://127.0.0.1:${(app.address() as { port: number }).port}`;
  t.after(async () => { await new Promise<void>(resolve => { app.close(() => resolve()); app.closeAllConnections(); }); store.close(); rmSync(dir, { recursive: true, force: true }); });
  let cookie = '';
  const request = async (path: string, data: unknown) => {
    const response = await fetch(`${origin}/api${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Stelux-Request': '1', Origin: origin, ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(data) });
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie')!.split(';')[0];
    return response;
  };
  const first = 'First-Password-2026';
  assert.equal((await request('/auth/setup', { name: 'Password admin', email: 'password-admin@example.test', password: first })).status, 201);
  return { request, first };
}

test('POST /api/auth/password: the hosted pilots refuse a password below the score OK with 400; the other profiles keep the length rule', async t => {
  const hosted = await server(t, HOSTED_RELEASE_PROFILE);
  const weak = await hosted.request('/auth/password', { currentPassword: hosted.first, password: 'aaaaaaaaaa' });
  assert.equal(weak.status, 400); assert.match((await weak.json()).error ?? '', /Password too weak/);
  assert.equal((await hosted.request('/auth/password', { currentPassword: 'wrong-current', password: 'abcdefghijklm' })).status, 422, 'the current password is checked first');
  assert.equal((await hosted.request('/auth/password', { currentPassword: hosted.first, password: 'abcdefghijklm' })).status, 200, '13 lower-case letters are OK');
  assert.equal((await hosted.request('/auth/password', { currentPassword: 'abcdefghijklm', password: 'Abcdef12' })).status, 422, 'the length minimum of the server stays (10 characters)');
  const full = await server(t, 'full');
  assert.equal((await full.request('/auth/password', { currentPassword: full.first, password: 'aaaaaaaaaa' })).status, 200, 'other profiles are unchanged');
});
