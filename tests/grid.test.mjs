import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyView, cellText, compareValues } from '../public/grid.js';
import { RULE_COLUMNS, ruleListRow, describeRule, ruleSettings, ruleSize, timeAgo, ruleWarnings } from '../lib/rules-view.js';
import { settingsFrom, demoOrgBundle } from '../lib/org-settings.js';

const rows = [
  ['Enabled', 'Lab flow test rule', 0, { show: null, text: 'No', sort: 0 }],
  ['Enabled', 'External Source label', 1, { show: null, text: 'Yes', sort: 1 }],
  ['Disabled', 'zeta rule', 10, { show: null, text: 'No', sort: 0 }],
  ['Enabled', 'alpha rule', 2, '—'],
];

test('column search keeps only rows whose cell contains the text, ignoring case', () => {
  assert.deepEqual(applyView(rows, { filters: { 1: 'RULE' } }), [0, 2, 3]);
  assert.deepEqual(applyView(rows, { filters: { 0: 'disab' } }), [2]);
  assert.deepEqual(applyView(rows, { filters: { 3: 'yes' } }), [1]);
  assert.deepEqual(applyView(rows, { filters: { 1: '  ' } }), [0, 1, 2, 3]);
});

test('Sort A to Z and Z to A, numbers in number order, blanks last both ways', () => {
  assert.deepEqual(applyView(rows, { sort: { col: 1, dir: 'asc' } }), [3, 1, 0, 2]);
  assert.deepEqual(applyView(rows, { sort: { col: 1, dir: 'desc' } }), [2, 0, 1, 3]);
  assert.deepEqual(applyView(rows, { sort: { col: 2, dir: 'asc' } }), [0, 1, 3, 2]);
  assert.deepEqual(applyView(rows, { sort: { col: 3, dir: 'desc' } }), [1, 0, 2, 3]);
  assert.deepEqual(applyView(rows, { sort: { col: 3, dir: 'asc' } }), [0, 2, 1, 3]);
});

test('the top search box matches any column and combines with column filters and sort', () => {
  assert.deepEqual(applyView(rows, { search: 'external' }), [1]);
  assert.deepEqual(applyView(rows, { search: 'rule', filters: { 0: 'enabled' }, sort: { col: 2, dir: 'desc' } }), [3, 0]);
});

test('cellText reads strings, numbers, nulls and { text } cells', () => {
  assert.equal(cellText(null), '');
  assert.equal(cellText(5), '5');
  assert.equal(cellText({ show: 'x', text: 'Yes' }), 'Yes');
  assert.ok(compareValues('item 2', 'item 10') < 0);
});

test('the Mail flow rules list uses the Exchange admin center columns in its order', () => {
  assert.deepEqual(RULE_COLUMNS, ['Status', 'Rule', 'Priority', 'Stop processing rules', 'Size (Bytes)', 'Last execution', 'Configuration supported', 'Unsupported reason']);
});

test('ruleListRow maps PowerShell values and never invents a missing one', () => {
  const now = Date.parse('2026-11-19T12:00:00Z');
  const row = ruleListRow({ Name: 'Lab flow test rule', State: 'Enabled', Priority: 0, StopRuleProcessing: false, Size: '434 B (434 bytes)', LastExecution: '2026-10-19T12:00:00Z', ConfigurationSupported: 'True' }, now);
  assert.equal(row.size, 434);
  assert.equal(row.stop, false);
  assert.equal(row.supported, true);
  assert.equal(row.lastExecutionWords, '1 month ago');
  const bare = ruleListRow({ Name: 'x', State: 'Enabled', Priority: 1 }, now);
  assert.equal(bare.size, null);
  assert.equal(bare.supported, null);
  assert.equal(bare.stop, null);
  assert.equal(bare.lastExecution, null);
  assert.equal(ruleSize(355), 355);
  assert.equal(ruleSize('1,024 bytes'), 1024);
  assert.equal(ruleSize('n/a'), null);
  assert.equal(timeAgo('2026-11-18T12:00:00Z', now), '1 day ago');
});

test('describeRule splits Exchange text into Apply this rule if, Do the following and Except if', () => {
  const words = describeRule("If the message:\n\tIs sent to 'a@contoso.com'\n\tand Includes these words in the subject: 'x'\nTake the following actions:\n\tReject the message\nExcept if the message:\n\tIs received from 'b@contoso.com'");
  assert.deepEqual(words.conditions, ["Is sent to 'a@contoso.com'", "Includes these words in the subject: 'x'"]);
  assert.deepEqual(words.actions, ['Reject the message']);
  assert.deepEqual(words.exceptions, ["Is received from 'b@contoso.com'"]);
  assert.deepEqual(describeRule(''), { conditions: [], actions: [], exceptions: [] });
});

test('rule settings use the portal labels and warnings name the risky ones', () => {
  const settings = Object.fromEntries(ruleSettings({ Name: 'r', Mode: 'AuditAndNotify', RuleErrorAction: 'Defer', SenderAddressLocation: 'HeaderOrEnvelope', StopRuleProcessing: true }));
  assert.equal(settings.Mode, 'Test with Policy Tips');
  assert.equal(settings["Defer the message if rule processing doesn't complete"], 'Yes');
  assert.equal(settings['Senders address'], 'Header or envelope');
  const warn = ruleWarnings({ State: 'Disabled', Mode: 'Audit', SetSCL: -1, ConfigurationSupported: false, UnsupportedReason: 'old condition' });
  assert.equal(warn.length, 4);
});

test('demo rules carry the portal columns so the demo looks like the Exchange admin center', () => {
  const rules = settingsFrom(demoOrgBundle()).settings.rules;
  assert.ok(rules.length >= 4);
  for (const r of rules) assert.ok('Size' in r && 'ConfigurationSupported' in r, r.Name);
});

test('the org settings read asks Exchange for the portal columns with Get- only', () => {
  const ps = readFileSync(new URL('../server/Invoke-Ex360Command.ps1', import.meta.url), 'utf8');
  const line = ps.split('\n').find(l => l.includes("Invoke-Read 'rules'") && l.includes('ConfigurationSupported'));
  assert.ok(line);
  for (const name of ['Size', 'LastExecution', 'ConfigurationSupported', 'UnsupportedReason', 'RuleErrorAction', 'SenderAddressLocation']) assert.match(line, new RegExp(name));
  assert.doesNotMatch(line, /\b(Set|New|Remove|Enable|Disable)-/);
});

test('every data table in app.js goes through the shared table with column menus', () => {
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const raw = (app.match(/el\('table'/g) || []).length;
  assert.ok(raw <= 2, `only the report fact and settings tables may build a raw table, found ${raw}`);
  assert.match(app, /function table\(headers, rows, options = \{\}\) \{\n\s+return dataTable\(/);
});

test('rows can fold open to show children, and the Compare sections table uses it for its objects', () => {
  const grid = readFileSync(new URL('../public/grid.js', import.meta.url), 'utf8');
  assert.match(grid, /rowChildren = null/);
  assert.match(grid, /class: 'row-fold', 'aria-expanded': String\(open\)/);
  const page = readFileSync(new URL('../public/snapshots-page.js', import.meta.url), 'utf8');
  assert.match(page, /rowChildren: i =>/);
  assert.match(page, /'Objects added, removed or changed'/, 'the flat objects table stays for now');
});
