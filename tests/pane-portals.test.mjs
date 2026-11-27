// Every pane on every page links to its portal page, and report downloads say what they are doing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PAGES } from '../lib/pages.js';
import { PANE_PORTALS, BY_TITLE, panePortal } from '../lib/pane-portals.js';
import { portalsFor } from '../lib/portals.js';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('every page has a portal for its panes, and every portal id exists with a link', () => {
  for (const page of PAGES) {
    const id = PANE_PORTALS[page.id];
    assert.ok(id, `${page.id} has no pane portal`);
    assert.ok(portalsFor(id)?.links?.length, `${page.id} -> ${id} has no links`);
  }
  for (const [view, map] of Object.entries(BY_TITLE)) for (const [title, id] of Object.entries(map)) assert.ok(portalsFor(id)?.links?.length, `${view} / ${title} -> ${id}`);
  for (const p of ['eac-home', 'app-consent', 'header-analyzer']) for (const l of portalsFor(p).links) assert.match(l.url, /^https:\/\//);
});

test('pane headings pick the specific portal page', () => {
  assert.equal(panePortal('security', 'Anti-spam (inbound)'), 'anti-spam');
  assert.equal(panePortal('security', 'Safe Links (Defender)'), 'safe-links');
  assert.equal(panePortal('security', 'Outbound spam and automatic forwarding'), 'outbound-spam');
  assert.equal(panePortal('domains', 'DKIM signing in Exchange Online'), 'dkim');
  assert.equal(panePortal('domains', 'contoso.com'), 'accepted-domains');
  assert.equal(panePortal('mb-policies', 'Transport rules, in priority order'), 'transport-rules');
  assert.equal(panePortal('mb-protocols', 'Authentication policy'), 'auth-policies');
  assert.equal(panePortal('mb-recipient', 'General', 'm365group'), 'groups-m365');
  assert.equal(panePortal('mb-recipient', 'Members', 'group'), 'groups');
  assert.equal(panePortal('mb-recipient', 'General', 'mailbox'), 'mailboxes');
});

test('panel() puts the portal button under every pane heading, not only at the bottom', () => {
  const app = read('public/app.js');
  assert.match(app, /const panel = \(\.\.\.kids\) => foldPane\(addPanePortal\(/);
  assert.match(app, /text: `Open in portal: \$\{main\.name\}`/);
  assert.match(app, /function reportSection\(s\) \{\n  const main = \(s\.portals/);
});

test('report downloads show progress, the saved file name, or the error', () => {
  const app = read('public/app.js');
  assert.match(app, /function downloadButton\(label, url, status\)/);
  assert.match(app, /Building the report… \$\{Math\.round/);
  assert.match(app, /Saved \$\{name\}/);
  assert.match(app, /The report was not downloaded: /);
  assert.doesNotMatch(app, /href: `\/api\/report\.(pdf|mhtml)\?/);
});
