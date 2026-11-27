// Single recipient pages added 2026-11-26, and the rule that every pane on every page folds.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PAGES } from '../lib/pages.js';
import { pageApplies } from '../lib/recipient-types.js';
import { demoExtra, folderRows, sharedFolders, auditRows, licenseRows, deviceRows } from '../lib/recipient-extra.js';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const NEW = ['mb-licenses', 'mb-folders', 'mb-devices', 'mb-messages', 'mb-quarantine', 'mb-changes'];

test('the six new pages sit under Single recipient, in the rail and in the app', () => {
  const app = read('public/app.js');
  const html = read('public/index.html');
  for (const id of NEW) {
    assert.equal(PAGES.find(p => p.id === id)?.section, 'Single recipient', id);
    assert.match(html, new RegExp(`data-view="${id}"`), id);
    assert.match(app, new RegExp(`'${id}': \\(\\) => guard`), id);
  }
  assert.equal(pageApplies('mb-devices', 'group').applies, false);
  assert.equal(pageApplies('mb-messages', 'group').applies, true);
  assert.equal(pageApplies('mb-licenses', 'mailuser').applies, true);
});

test('the reads behind them are reads only', () => {
  const ps = read('server/Invoke-Ex360Command.ps1');
  const block = ps.slice(ps.indexOf("$Mode -eq 'recipientextra'"), ps.indexOf("$Mode -eq 'ipps'"));
  for (const c of ['Get-MobileDevice', 'Get-MailboxFolderStatistics', 'Get-MailboxFolderPermission', 'Search-AdminAuditLog -ObjectIds']) assert.match(block, new RegExp(c), c);
  assert.doesNotMatch(block, /\b(Set|New|Remove|Add|Enable|Disable|Update)-[A-Z]/);
});

test('shaping: folders hide untouched defaults, audit is newest first, licenses list every plan', () => {
  const rows = folderRows([{ Folder: 'Inbox', FolderType: 'Inbox', User: 'Default', AccessRights: ['None'] }, { Folder: 'Calendar', FolderType: 'Calendar', User: 'Default', AccessRights: ['None'] }, { Folder: 'Inbox', FolderType: 'Inbox', User: 'Adele', AccessRights: ['Reviewer'] }]);
  assert.deepEqual(sharedFolders(rows).map(r => `${r.folder}/${r.user}`), ['Calendar/Default', 'Inbox/Adele']);
  assert.deepEqual(auditRows([{ RunDate: '2026-01-01T00:00:00Z', CmdletName: 'A' }, { RunDate: '2026-02-01T00:00:00Z', CmdletName: 'B' }]).map(r => r.cmdlet), ['B', 'A']);
  const lic = licenseRows([{ skuId: 's', skuPartNumber: 'SPE_E5', servicePlans: [{ servicePlanName: 'EXCHANGE_S_ENTERPRISE', provisioningStatus: 'Success' }, { servicePlanName: 'TEAMS1', provisioningStatus: 'Disabled' }] }], [{ skuId: 's', assignedByGroup: 'g1', error: 'None' }], { g1: 'E5 users' });
  assert.equal(lic[0].name, 'Microsoft 365 E5');
  assert.equal(lic[0].assigned, 'Group: E5 users');
  assert.deepEqual(lic[0].plans.map(p => [p.name, p.email]), [['Exchange Online (Plan 2)', true], ['TEAMS1', false]]);
  assert.equal(deviceRows([{ DeviceModel: 'Pixel' }])[0].name, 'Pixel');
  for (const what of ['devices', 'folders', 'audit', 'licenses']) assert.equal(demoExtra(what, 'megan.bowen@contoso.com').ok, true, what);
});

test('every pane folds: tables go in a titled pane, and late panes are folded by the page observer', () => {
  const app = read('public/app.js');
  assert.match(app, /function showRows\(parent, value, headers, mapRow, empty, details, title\)/);
  assert.match(app, /new MutationObserver\(\(\) => \{\n  for \(const s of pageEl\.querySelectorAll\('section\.panel, section\.walk-box'\)\)/);
  assert.match(app, /return foldPane\(el\('section', \{ class: 'panel stack report-section'/);
  // A showRows straight into a page root needs a title or lastPane(), or its table would sit outside every pane.
  assert.deepEqual(app.split('\n').filter(l => /showRows\(root,/.test(l) && !/'[^']+'\);\s*$/.test(l) && !/r => \{$/.test(l)), []);
});

test('Topology at a glance boxes fold and start collapsed', () => {
  const page = read('public/nexthop-page.js');
  assert.match(page, /set\(opened\.has\(r\.key\)\)/);
  assert.match(page, /Expand all boxes/);
  assert.match(read('public/styles.css'), /\.tg-box\.folded > \.tg-body\{display:none\}/);
});
