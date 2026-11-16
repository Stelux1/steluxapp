import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The local entry (client/main.tsx) and the hosting wrapper (pages/_app.tsx) each list the stylesheets: Next.js accepts
// global CSS only in _app. A stylesheet missing from the wrapper ships a page without its styles, and no build fails.
const styles = (file: string, prefix: string) => [...readFileSync(new URL(file, import.meta.url), 'utf8').matchAll(/^import '([^']+\.css)';$/gm)].map(match => match[1].startsWith(prefix) ? match[1].slice(prefix.length) : match[1]);

test('the hosting wrapper loads the same stylesheets, in the same order, as the local entry', () => {
  const local = styles('../client/main.tsx', './'), hosted = styles('../pages/_app.tsx', '../client/');
  assert.ok(local.length > 20, 'the local entry lists its stylesheets');
  assert.deepEqual(hosted, local);
});
