import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { viewFromHash, writeView, tabFromHash, writeTab } from '../public/router.js';
import { switcherHtml } from '../public/shell.js';
import { APPS_360 } from '../public/360-apps.js';
import { ICONS_360, iconSvg } from '../public/360-icons.js';
import { readCollapsed } from '../public/nav-sections.js';
import { initialTheme, saveTheme, THEME_KEY } from '../public/theme.js';
import { PAGES } from '../lib/pages.js';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const html = read('public/index.html');
const nav = html.slice(html.indexOf('<nav id="navigation"'), html.indexOf('</nav>'));
const css = read('public/styles.css');
const base = read('public/360-base.css');

test('viewFromHash reads #page and #/page and rejects unknown pages', () => {
  const isView = id => ['start', 'hops', 'mailbox'].includes(id);
  assert.equal(viewFromHash('#hops', isView), 'hops');
  assert.equal(viewFromHash('#/mailbox', isView), 'mailbox');
  assert.equal(viewFromHash('#hops?sample=spoof', isView), 'hops');
  assert.equal(viewFromHash('#nope', isView), null);
  assert.equal(viewFromHash('', isView), null);
});

test('writeView replaces an empty hash and pushes a new page', () => {
  const calls = [];
  const hist = { pushState: (_, __, u) => calls.push(['push', u]), replaceState: (_, __, u) => calls.push(['replace', u]) };
  writeView('start', { pathname: '/', search: '', hash: '' }, hist);
  writeView('hops', { pathname: '/', search: '', hash: '#start' }, hist);
  writeView('hops', { pathname: '/', search: '', hash: '#hops' }, hist);
  assert.deepEqual(calls, [['replace', '/#start'], ['push', '/#hops']]);
});

test('tabFromHash and writeTab keep the tab without a second history entry', () => {
  assert.equal(tabFromHash('#security/quarantine'), 'quarantine');
  assert.equal(tabFromHash('#security'), null);
  const calls = [];
  const hist = { replaceState: (_, __, u) => calls.push(u), pushState: () => calls.push('push') };
  writeTab('security', 'quarantine', { pathname: '/', search: '', hash: '#security' }, hist);
  writeTab('security', 'quarantine', { pathname: '/', search: '', hash: '#security/quarantine' }, hist);
  assert.deepEqual(calls, ['/#security/quarantine']);
});

test('app switcher lists every 360 app, marks Exchange 360, and never links an empty url', () => {
  const out = switcherHtml('ex-360');
  for (const app of APPS_360) assert.ok(out.includes(app.name), app.name);
  assert.match(out, /aria-current="page"><strong>Exchange 360<\/strong>/);
  assert.doesNotMatch(out, /href=""/);
});

test('rail links are anchors, group headers are buttons, switcher sits under the brand', () => {
  assert.doesNotMatch(nav, /<button data-view=/);
  for (const match of nav.matchAll(/<a href="#([a-z0-9-]+)" data-view="([a-z0-9-]+)" class="nav-item(?: active)?">/g)) assert.equal(match[1], match[2]);
  assert.ok(html.indexOf('id="app-switcher"') > html.indexOf('class="brand"'));
  assert.ok(html.indexOf('id="app-switcher"') < html.indexOf('<nav id="navigation"'));
  const footer = html.slice(html.indexOf('<div class="sidebar-bottom">'));
  assert.ok(footer.includes('id="viewer-button"') && footer.includes('id="theme-toggle"'));
  assert.doesNotMatch(html.slice(html.indexOf('class="page-heading"'), html.indexOf('id="page-title"')), /eyebrow/);
});

test('every rail page has its own icon from the shared set', () => {
  const pages = [...nav.matchAll(/data-view="([^"]+)" class="nav-item[^"]*"><span data-nav-icon="([^"]+)">/g)];
  assert.equal(pages.length, PAGES.length);
  const icons = pages.map(match => match[2]);
  assert.deepEqual(icons.filter((name, i) => icons.indexOf(name) !== i), []);
  for (const name of icons) assert.ok(ICONS_360[name], name);
  assert.doesNotMatch(nav, /data-icon=/);
});

test('section headers are uppercase buttons one step larger than the links', () => {
  const labels = [...nav.matchAll(/<button type="button" class="nav-label" aria-expanded="true" data-section="[a-z-]+"><span>[A-Z -]+<\/span><span class="nav-chevron" aria-hidden="true"><\/span><\/button>/g)];
  assert.ok(labels.length >= 4);
  assert.match(base, /\.nav-label\{[^}]*font-size:var\(--text-base\)[^}]*text-transform:uppercase/);
  assert.match(base, /\.nav-item\{[^}]*font-size:var\(--text-sm\)/);
  assert.match(base, /\.nav-label\[aria-expanded="false"\] \.nav-chevron\{transform:rotate\(-45deg\)\}/);
  assert.doesNotMatch(css, /\.nav-label[^{]*\{[^}]*font-size:var\(--text-(xs|sm)\)/);
});

test('iconSvg is a decorative svg and unknown names fall back to a dot', () => {
  assert.match(iconSvg('compass'), /^<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">.+<\/svg>$/);
  assert.match(iconSvg('nope'), /<circle cx="12" cy="12" r="3"\/>/);
  for (const body of Object.values(ICONS_360)) assert.doesNotMatch(body, /<script|on[a-z]+=|href=/i);
});

test('collapsed sections are remembered under the key the app passes', () => {
  const store = { getItem: storageKey => (storageKey === 'ex360/nav/collapsed' ? '["tools"]' : null) };
  assert.deepEqual(readCollapsed(store, 'ex360/nav/collapsed'), ['tools']);
  assert.deepEqual(readCollapsed({ getItem: () => '{' }), []);
});

test('theme: a stored choice wins, otherwise the OS, under ex360-theme', () => {
  const memory = {};
  const store = { getItem: key => memory[key] ?? null, setItem: (key, value) => { memory[key] = value; } };
  const os = dark => ({ matchMedia: () => ({ matches: dark }) });
  assert.equal(THEME_KEY, 'ex360-theme');
  assert.equal(initialTheme(store, os(true)), 'dark');
  saveTheme('light', store);
  assert.equal(initialTheme(store, os(true)), 'light');
});

test('Segoe UI like the Microsoft portals, no web font download, Fluent type ramp', () => {
  assert.match(base, /--font-sans:"Segoe UI"/);
  assert.doesNotMatch(base, /@font-face|Inter/);
  assert.doesNotMatch(html, /fonts\.googleapis/);
  const steps = { xs: '.75rem', sm: '.8125rem', base: '.875rem', md: '1rem', lg: '1.25rem', xl: '1.5rem', '2xl': '1.75rem' };
  for (const [name, size] of Object.entries(steps)) assert.match(base, new RegExp(`--text-${name}:${size.replace('.', '\\.')}`));
});

test('tables look like Fluent DetailsList: 42px header, striped rows, row hover and selection', () => {
  assert.match(css, /thead th\{[^}]*height:42px/);
  assert.match(css, /tbody tr:nth-child\(odd\)\{background:var\(--row-a\)\}/);
  assert.match(css, /tbody tr:nth-child\(even\)\{background:var\(--row-b\)\}/);
  assert.match(css, /tbody tr:hover\{background:var\(--row-stripe-hover\)\}/);
  assert.match(css, /tr\.is-selected/);
  assert.match(html, /<header class="suite-bar">/);
});

test('styles.css uses the type tokens and only weights 400, 500 and 600', () => {
  assert.deepEqual(css.match(/font(?:-size)?:[^;}]*\d(?:px|pt|rem)\b/g) ?? [], []);
  assert.deepEqual((css.match(/font-weight:\s*(\d+)/g) ?? []).filter(w => !/(400|500|600)$/.test(w)), []);
  let depth = 0;
  for (const ch of css.replace(/\/\*[\s\S]*?\*\//g, '')) {
    if (ch === '{') depth += 1;
    if (ch === '}') depth -= 1;
    assert.ok(depth >= 0);
  }
  assert.equal(depth, 0);
});

function tokens(block) {
  const out = {};
  for (const match of block.matchAll(/--([\w-]+)\s*:\s*(#[0-9a-f]{6})/gi)) out[match[1]] = match[2].toLowerCase();
  return out;
}
const lum = hex => {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const light = { ...tokens(base.slice(base.indexOf('--bg:'), base.indexOf('}', base.indexOf('--bg:')))), ...tokens(css.slice(0, css.indexOf('}'))) };
const dark = { ...tokens(base.slice(base.lastIndexOf('--bg:'), base.indexOf('}', base.lastIndexOf('--bg:')))), ...tokens(css.slice(css.indexOf(':root[data-theme="dark"]'), css.indexOf('}', css.indexOf(':root[data-theme="dark"]')))) };

for (const [name, theme] of [['light', light], ['dark', dark]]) {
  test(`${name} theme: button edges are at least 3:1`, () => {
    for (const bg of [theme.bg, theme.surface, theme['surface-2']]) {
      assert.ok(contrast(theme['btn-border'], bg) >= 3, theme['btn-border']);
      assert.ok(contrast(theme['accent-strong'], bg) >= 3);
    }
  });
  test(`${name} theme: button fills are not the page`, () => {
    for (const fill of [theme['btn-bg'], theme['btn-off-bg']]) for (const bg of [theme.bg, theme.surface, theme['surface-2']]) assert.notEqual(fill, bg);
  });
  test(`${name} theme: disabled buttons stay visible and different`, () => {
    for (const bg of [theme.bg, theme.surface]) assert.ok(contrast(theme['btn-off-border'], bg) >= 3);
    assert.notEqual(theme['btn-off-bg'], theme['btn-bg']);
    assert.notEqual(theme['btn-off-border'], theme['btn-border']);
  });
  test(`${name} theme: button text is at least 4.5:1`, () => {
    assert.ok(contrast(theme['btn-fg'], theme['btn-bg']) >= 4.5);
    assert.ok(contrast(theme['btn-fg'], theme['btn-hover-bg']) >= 4.5);
    assert.ok(contrast(theme['accent-ink'], theme['accent-strong']) >= 4.5);
    assert.ok(contrast(theme.accent, theme.surface) >= 4.5);
  });
}

test('no button style is transparent or borderless', () => {
  assert.doesNotMatch(css, /\.btn[^{]*\{[^}]*background:\s*(none|transparent)/);
  assert.match(css, /\.btn:disabled[^{]*\{[^}]*dashed/);
});

test('striped row shades differ from each other, the panel and the page in light and dark', () => {
  const blocks = [base.slice(base.indexOf(':root{'), base.indexOf('@media (prefers-color-scheme:dark)')), base.slice(base.indexOf(':root[data-theme="dark"]'))];
  for (const block of blocks) {
    const v = name => (block.match(new RegExp(`--${name}:(#[0-9a-f]{6})`)) || [])[1];
    const shades = ['row-a', 'row-b', 'surface', 'bg', 'row-stripe-hover', 'row-stripe-selected'].map(v);
    assert.ok(shades.every(Boolean), `missing a token in ${block.slice(0, 30)}`);
    assert.equal(new Set(shades).size, shades.length, `shades must all differ: ${shades.join(' ')}`);
  }
});
