// Owner rule (2026-11-26, repeated 2026-11-27): on every page every section is collapsible and starts collapsed,
// and every button shows it is doing something.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installNavSections } from '../public/nav-sections.js';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('panes start collapsed on every visit: an expanded pane is not remembered in the browser', () => {
  const app = read('public/app.js');
  assert.doesNotMatch(app, /localStorage\.setItem\(PANE_OPEN_KEY/);
  assert.match(app, /localStorage\.removeItem\('ex360\.panes\.open'\)/, 'old remembered panes are cleared');
  assert.match(app, /if \(paneMemory\.view !== view\) Object\.assign\(paneMemory, \{ view, open: \{\} \}\)/, 'leaving a page forgets what was open');
  assert.match(app, /set\(!openPanes\(\)\[key\]\)/, 'a pane is folded unless opened on this visit');
});

test('NextHop "What happens, step by step" and the trace walk box fold too; no step opens itself', () => {
  const app = read('public/app.js');
  assert.match(app, /querySelectorAll\('section\.panel, section\.walk-box'\)/);
  assert.match(app, /:scope > \.spread > h3'\)/);
  assert.match(read('public/styles.css'), /\.walk-box\.folded > :not\(\.pane-headrow\)/);
  assert.doesNotMatch(read('public/nexthop-page.js'), /walk-settings'[^)]*open: ''/);
});

test('Config snapshots opens Compare only for a comparison you just ran', () => {
  const page = read('public/snapshots-page.js');
  assert.match(page, /if \(justCompared\) openPane\(comparePane\)/);
  assert.match(page, /drawDiff\(\{ justCompared: true \}\)/);
});

test('every page with two or more panes has Expand all sections / Collapse all sections with busy feedback', () => {
  assert.match(read('public/index.html'), /id="fold-all"[^>]*hidden>Expand all sections</);
  const app = read('public/app.js');
  assert.match(app, /busy\(all, expand \? 'Expanding…' : 'Collapsing…'/);
  assert.match(app, /all\.hidden = folds\.length < 2/);
});

function fakeNav() {
  const mk = (cls, data = {}) => {
    const classes = new Set(cls.split(' '));
    const attrs = {};
    return { tagName: 'BUTTON', dataset: { ...data }, textContent: data.section || data.group || 'x', title: '',
      classList: { contains: c => classes.has(c), toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)), add: c => classes.add(c) },
      setAttribute: (k, v) => { attrs[k] = v; }, getAttribute: k => attrs[k], querySelector: () => true, insertAdjacentHTML() {}, addEventListener() {}, closest: () => null, attrs, classes };
  };
  const setup = mk('nav-label', { section: 'setup' });
  const setupItem = mk('nav-item', { view: 'setup' });
  const org = mk('nav-label', { section: 'organization' });
  const group = mk('nav-group nav-item', { group: 'mailboxes' });
  const child = mk('nav-item nav-child', { view: 'rcp-shared' });
  const items = [setup, setupItem, org, group, child];
  items.forEach((n, i) => { n.nextElementSibling = items[i + 1] || null; n.previousElementSibling = items[i - 1] || null; });
  return { nav: { querySelectorAll: sel => (sel === '.nav-label' ? [setup, org] : sel === '.nav-group' ? [group] : []), querySelector: () => child }, setup, setupItem, org, group, child };
}

test('the left menu starts with every section and group collapsed, and opens only the one holding the page', () => {
  const { nav, setup, setupItem, org, group, child } = fakeNav();
  const writes = [];
  const storage = { getItem: () => '[]', setItem: (k, v) => writes.push(v) };
  const sections = installNavSections(nav, storage, 'ex360/nav/collapsed', { startCollapsed: true });
  assert.equal(setup.attrs['aria-expanded'], 'false');
  assert.equal(org.attrs['aria-expanded'], 'false');
  assert.equal(group.attrs['aria-expanded'], 'false');
  assert.ok(setupItem.classes.has('nav-collapsed'));
  sections.expandItem(child);
  assert.equal(org.attrs['aria-expanded'], 'true');
  assert.equal(group.attrs['aria-expanded'], 'true');
  assert.equal(setup.attrs['aria-expanded'], 'false', 'other sections stay collapsed');
  assert.deepEqual(writes, [], 'nothing is remembered between loads');
  assert.match(read('public/index.html'), /data-rail data-nav-start="collapsed"/);
  assert.match(read('public/shell.js'), /startCollapsed: rail\.dataset\.navStart === 'collapsed'/);
});

test('buttons that had no busy label now say what they are doing', () => {
  const app = read('public/app.js');
  assert.match(app, /busy\(again, 'Reading again…', \(\) => render\(\)\)/);
  assert.match(app, /busy\(more, showAll \? 'Showing fewer…' : 'Showing all…'/);
  assert.match(read('public/nexthop-page.js'), /busy\(close, 'Closing…'/);
  assert.match(read('public/busy.js'), /href\.startsWith\('#'\) && href !== doc\.defaultView\?\.location\?\.hash\) opening\(target\)/);
});

// Owner, 2026-11-27, after opening his export in NextHop: "This didn't give me any indication that it worked."
test('NextHop says a configuration opened and shows what the click produced', () => {
  const src = read('public/nexthop-page.js');
  assert.match(src, /load\(cfg, `export of [^\n]*file\.name, \{ announce: true \}\)/, 'opening a file announces it');
  assert.match(src, /nh\.notice = \{/);
  assert.match(src, /callout ok', role: 'status' \}, el\('strong', \{ text: nh\.notice\.title \}\)/, 'the Configuration pane shows the notice');
  assert.match(src, /if \(announce\) openTestMessage\(\);/, 'the Test message pane opens after a file opens');
  assert.match(src, /for \(const host of \[pathHost, resultHost\]\) unfold\(/, 'Predict expands the lanes and the prediction');
  assert.match(src, /const opened = nh\.cfg && !nh\.cfg\.live && !nh\.wantLive;/, 'a live read never silently replaces an opened file');
  assert.match(src, /Use the live read instead/);
});
