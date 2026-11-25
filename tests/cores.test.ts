// Weld Core / Material Core (client requests 20.11.2026): the Core is chosen at every sign-in, the five-card selector,
// the Core colours of the sidebar and the Grid | List view of the main projects.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { COMING_CORES, coreFanItems, MATERIAL_CORE_COLOR, PILOTS, PILOT_MAP, WELD_CORE_COLOR, pathAfterSignIn } from '../shared/pilots.ts';
import { CoreFanMenu, CoreSwitch, PilotSelector, fanOffsets } from '../client/pilot.tsx';
import { readMainProjectView } from '../client/project-workspace.tsx';
import type { User } from '../shared/types.ts';

const user = { id: 'u', name: 'Uma', email: 'uma@example.test', profileId: 'p', permissions: { general: 0, materials: 0, welding: 0, tools: 0, settings: 0 } } as User;
const source = (file: string) => readFileSync(join(process.cwd(), file), 'utf8');

test('the pilots are called Weld Core and Material Core; keys and paths stay weld / mto', () => {
  assert.deepEqual(PILOTS.map(pilot => [pilot.key, pilot.title]), [['weld', 'Weld Core'], ['mto', 'Material Core']]);
  assert.equal(PILOT_MAP.weld.description, 'Welds, inspections and releases for every isometric.');
  assert.equal(PILOT_MAP.mto.description, 'Material take-off, ordering, stock and logistics.');
  // No user-visible "Pilot" name is left in the shell and the selector.
  for (const file of ['client/pilot.tsx', 'client/App.tsx', 'client/permission-profile-editor.tsx', 'shared/access-ui.ts']) assert.doesNotMatch(source(file).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''), /['"`>](?:[^'"`<]*\s)?(?:Weld Pilot|MTO Pilot|WeldPilot|MTOPilot)\b/, file);
});

test('every sign-in shows the Core selector first; deep links into a Core keep working', () => {
  // An address that only names a Core (the tab of an earlier session) opens the selector.
  for (const path of ['/', '/weld', '/weld/', '/mto', '/weld/dashboard', '/mto/dashboard/', '/weld/workspace/main-projects', '/dashboard']) assert.equal(pathAfterSignIn(path), '/', path);
  // A page inside a Core opens after sign-in, as before.
  for (const path of ['/weld/workspace/isometrics/iso-1', '/mto/materials/stock', '/weld/welding/welds', '/weld/workspace/iso-overview', '/materials/stock', '/workspace/isometrics/iso-1']) assert.equal(pathAfterSignIn(path), path, path);
  // The sign-in applies it, and `/` stays the selector also for an account with one Core (no automatic jump into it).
  const app = source('client/App.tsx'), pilot = source('client/pilot.tsx');
  assert.match(app, /onLogin=\{user => \{ setSessionEnded\(false\); signedIn\(user\);/);
  assert.match(app, /pathAfterSignIn\(window\.location\.pathname\)/);
  assert.doesNotMatch(pilot, /allowed\.length === 1 \?/);
});

test('the selector shows five Cores: Weld and Material Core open, the other three say Coming soon and never open', () => {
  assert.deepEqual(COMING_CORES.map(core => core.title), ['Tools & Equipment Core', 'Finance & Calculation Core', 'Teams Core']);
  const html = renderToStaticMarkup(createElement(PilotSelector, { user, pilots: PILOTS, onOpen: () => undefined, onLogout: () => undefined, logo: '' }));
  const titles = [...html.matchAll(/<strong>([^<]+)<\/strong>/g)].map(match => match[1]).filter(text => / Core$/.test(text));
  assert.deepEqual(titles, ['Weld Core', 'Material Core', 'Tools &amp; Equipment Core', 'Finance &amp; Calculation Core', 'Teams Core']);
  assert.match(html, /href="\/weld"/); assert.match(html, /href="\/mto"/);
  assert.equal((html.match(/<a class="pilot-tile"/g) || []).length, 2, 'only the two built Cores are links');
  assert.equal((html.match(/aria-disabled="true"/g) || []).length, 3);
  assert.equal((html.match(/Coming soon/g) || []).length, 3);
  for (const core of COMING_CORES) assert.match(html, new RegExp(core.description.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(html, new RegExp(`--pilot-color:${WELD_CORE_COLOR}`)); assert.match(html, new RegExp(`--pilot-color:${MATERIAL_CORE_COLOR}`));
  // A Core not enabled for the account is shown but does not open.
  const weldOnly = renderToStaticMarkup(createElement(PilotSelector, { user, pilots: [PILOT_MAP.weld], onOpen: () => undefined, onLogout: () => undefined, logo: '' }));
  assert.equal((weldOnly.match(/<a class="pilot-tile"/g) || []).length, 1); assert.doesNotMatch(weldOnly, /href="\/mto"/); assert.match(weldOnly, /Material Core: not enabled for your account/);
  // Desktop 3 + 2 centred, phones one column.
  const css = source('client/pilots.css');
  assert.match(css, /\.pilot-tiles \{[^}]*repeat\(6, minmax\(0, 1fr\)\)/); assert.match(css, /\.pilot-tiles > li:nth-child\(4\):nth-last-child\(2\) \{ grid-column: 2 \/ span 2; \}/);
  assert.match(css, /@media \(max-width: 640px\) \{[\s\S]*?\.pilot-tiles \{ grid-template-columns: 1fr;/);
});

test('the Switch fan lists the five Cores in order with their states; the button alone shows while it is closed', () => {
  assert.deepEqual(coreFanItems(['weld', 'mto'], 'weld').map(item => [item.label, item.state, item.stateText]), [['Weld Core', 'active', 'Active'], ['Material Core', 'open', ''], ['Tools & Equipment', 'soon', 'Coming soon'], ['Finance & Calculation', 'soon', 'Coming soon'], ['Teams Core', 'soon', 'Coming soon']]);
  assert.deepEqual(coreFanItems(['mto', 'weld'], 'mto').map(item => item.state).slice(0, 2), ['open', 'active']);
  assert.deepEqual(coreFanItems(['weld'], 'weld').map(item => [item.label, item.state, item.stateText]).slice(0, 2), [['Weld Core', 'active', 'Active'], ['Material Core', 'disabled', 'Not enabled']]);
  assert.deepEqual(coreFanItems(['weld', 'mto'], 'weld').map(item => item.color), [WELD_CORE_COLOR, MATERIAL_CORE_COLOR, ...COMING_CORES.map(core => core.color)]);
  const closed = renderToStaticMarkup(createElement(CoreSwitch, { current: 'weld', allowed: ['weld', 'mto'], onOpen: () => undefined }));
  assert.match(closed, /aria-haspopup="menu"/); assert.match(closed, /aria-expanded="false"/); assert.doesNotMatch(closed, /role="menu"/); assert.doesNotMatch(closed, /Coming soon/);
  const open = renderToStaticMarkup(createElement(CoreFanMenu, { items: coreFanItems(['weld', 'mto'], 'weld') }));
  assert.match(open, /role="menu"/); assert.match(open, /Switch Core/);
  assert.deepEqual([...open.matchAll(/<strong>([^<]+)<\/strong>/g)].map(match => match[1]), ['Weld Core', 'Material Core', 'Tools &amp; Equipment', 'Finance &amp; Calculation', 'Teams Core']);
  assert.equal((open.match(/role="menuitem"/g) || []).length, 5);
  assert.equal((open.match(/aria-disabled="true"/g) || []).length, 4, 'the active Core and the three coming-soon Cores do not act');
  assert.equal((open.match(/aria-current="true"/g) || []).length, 1); assert.equal((open.match(/Coming soon/g) || []).length, 3);
  assert.match(open, /is-active[^>]*aria-current="true"[\s\S]*?Active/); assert.doesNotMatch(open, /<a /);
  const notEnabled = renderToStaticMarkup(createElement(CoreFanMenu, { items: coreFanItems(['weld'], 'weld') }));
  assert.match(notEnabled, /Not enabled/); assert.equal((notEnabled.match(/aria-disabled="true"/g) || []).length, 5);
  // Arc: staggered, one offset per pill, the middle pills furthest out.
  const arc = fanOffsets(6); assert.equal(arc.length, 6); assert.ok(arc[2].dx > arc[0].dx && arc[3].dx > arc[5].dx); assert.ok(arc.every((at, index) => index === 0 || at.dy > arc[index - 1].dy));
  const css = source('client/pilots.css');
  assert.match(css, /animation-delay: calc\(var\(--i\) \* 40ms\)/); assert.match(css, /prefers-reduced-motion: reduce\) \{ \.core-fan-backdrop, \.core-fan-caption, \.core-fan-item \{ animation: none; \}/);
  assert.match(css, /\.core-fan-layer \{ position: fixed; inset: 0;/); assert.match(css, /@media \(max-width: 760px\) \{\s*\.core-fan \{/);
});

/** WCAG relative luminance and contrast of #rrggbb colours. */
const luminance = (hex: string) => { const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a: string, b: string) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const mix = (a: string, share: number, b: string) => '#' + [1, 3, 5].map(i => Math.round(parseInt(a.slice(i, i + 2), 16) * share + parseInt(b.slice(i, i + 2), 16) * (1 - share)).toString(16).padStart(2, '0')).join('');
const NAVY = '#061b42';

test('the sidebar takes the Core colour and keeps WCAG AA contrast on the dark navy', () => {
  const css = source('client/pilots.css');
  assert.match(source('client/App.tsx'), /\$\{pilot \? ' has-core' : ''\}/);
  assert.match(css, /--core-ink: color-mix\(in srgb, var\(--module-color\) 70%, #fff\)/);
  assert.match(css, /\.has-core \.sidebar \.project-switch-link \{ color: var\(--core-ink\); \}/);
  assert.match(css, /\.has-core \.sidebar \.live-dot[^{]*\{ background: var\(--module-color\); \}/);
  assert.match(css, /\.has-core \.sidebar \.sub-nav-item\.active[^{]*\{ background: color-mix\(in srgb, var\(--module-color\) 22%, var\(--navy\)\); color: #fff; box-shadow: inset 3px 0 var\(--module-color\); \}/);
  // The wave: behind the menu, never clickable, gone with more contrast.
  assert.match(css, /\.has-core \.sidebar::before \{[^}]*z-index: -1; pointer-events: none;/);
  assert.match(css, /@media \(prefers-contrast: more\), \(forced-colors: active\) \{ \.has-core \.sidebar::before \{ display: none; \}/);
  for (const color of [WELD_CORE_COLOR, MATERIAL_CORE_COLOR]) {
    assert.ok(contrast(mix(color, 0.7, '#ffffff'), NAVY) >= 4.5, `Change site and focus rings in ${color}`);
    assert.ok(contrast('#ffffff', mix(color, 0.22, NAVY)) >= 4.5, `active item text on the ${color} tint`);
    assert.ok(contrast('#ffffff', mix(color, 0.85, '#000000')) >= 3, `white icon on the ${color} badge square`);
  }
});

test('main projects remember Grid or List per browser; blocked storage falls back to the cards', () => {
  assert.equal(readMainProjectView({ getItem: () => 'list' }), 'list');
  assert.equal(readMainProjectView({ getItem: () => 'grid' }), 'grid');
  assert.equal(readMainProjectView({ getItem: () => null }), 'grid');
  assert.equal(readMainProjectView({ getItem: () => { throw new Error('blocked'); } }), 'grid');
  assert.equal(readMainProjectView(), 'grid', 'no window in node: the cards');
  const page = source('client/project-workspace.tsx');
  assert.match(page, /aria-label="Show main projects as"/);
  for (const header of ['Main project', 'Address', 'Subprojects', 'Isometrics', 'Welds', 'WDI progress', 'WDI completed', 'WDI remaining', 'WDI total']) assert.match(page, new RegExp(`<th scope="col"[^>]*>${header}</th>`), header);
});
