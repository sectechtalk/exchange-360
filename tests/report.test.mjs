import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildMailboxReport, command } from '../lib/report.js';
import { demoReportInput } from '../lib/demo-report.js';
import { identityOf, scopeMatch, protectionFor, PROTECTION, transportRuleFor, decodeHolds, conditionalAccessFor, dlpFor } from '../lib/report-policy.js';
import { reportPdf, reportFileName } from '../lib/report-pdf.js';
import { wrap, winAnsi } from '../lib/pdf.js';
import { skuDisplayName, normalizeSku } from '../lib/licenses.js';
import { notAuthorized } from '../lib/permissions.js';

const demo = id => buildMailboxReport({ ...demoReportInput(id), timeZone: 'America/Los_Angeles', generatedAt: '2026-11-18T01:00:00Z' });
const section = (report, id) => report.sections.find(s => s.id === id);
const allText = report => JSON.stringify(report.sections);

const who = identityOf({
  user: { id: 'u1', mail: 'pat@contoso.com', userPrincipalName: 'pat@contoso.com', proxyAddresses: ['SMTP:pat@contoso.com', 'smtp:pat@fabrikam.example'] },
  mailbox: { Alias: 'pat', Name: 'pat' },
  groups: [{ id: 'g1', displayName: 'Finance', mail: 'finance@contoso.com' }],
});

test('license part numbers show as plain names', () => {
  assert.equal(skuDisplayName('MICROSOFT_365_E7'), 'Microsoft 365 E7');
  assert.equal(skuDisplayName('SPE_E5'), 'Microsoft 365 E5');
  assert.equal(skuDisplayName('POWER_AUTOMATE_PREMIUM'), 'Power Automate Premium');
  assert.equal(normalizeSku({ skuPartNumber: 'MICROSOFT_365_E7', consumedUnits: 1, prepaidUnits: { enabled: 1 } }).name, 'Microsoft 365 E7');
});

test('a rule needs every condition type to match, and an exception always wins', () => {
  assert.equal(scopeMatch({ SentToMemberOf: ['finance@contoso.com'] }, who).inScope, true);
  assert.equal(scopeMatch({ SentToMemberOf: ['finance@contoso.com'], RecipientDomainIs: ['northwind.example'] }, who).inScope, false);
  assert.equal(scopeMatch({ RecipientDomainIs: ['contoso.com'], ExceptIfSentTo: ['pat@contoso.com'] }, who).excluded, true);
  assert.equal(scopeMatch({ SentTo: ['pat'] }, who).inScope, true, 'alias names the user');
  assert.equal(scopeMatch({}, who).scoped, false);
  assert.equal(scopeMatch({ From: ['pat@fabrikam.example'] }, who, 'sender').inScope, true);
});

test('email protection follows Strict, Standard, custom by priority, built-in, then default', () => {
  const spam = PROTECTION.find(t => t.key === 'antiSpam');
  const links = PROTECTION.find(t => t.key === 'safeLinks');
  const base = {
    spamPolicy: [{ Name: 'Default', IsDefault: true }, { Name: 'Finance spam' }, { Name: 'Everyone spam' }],
    spamRule: [{ Name: 'Everyone spam', Priority: 1, State: 'Enabled', RecipientDomainIs: ['contoso.com'], HostedContentFilterPolicy: 'Everyone spam' }, { Name: 'Finance spam', Priority: 0, State: 'Enabled', SentToMemberOf: ['Finance'], HostedContentFilterPolicy: 'Finance spam' }],
  };
  assert.equal(protectionFor(spam, base, who).applies, 'Finance spam');
  const strict = { ...base, presetEop: [{ Name: 'Strict Preset Security Policy', State: 'Enabled', SentTo: ['pat@contoso.com'], HostedContentFilterPolicy: 'Strict1' }, { Name: 'Standard Preset Security Policy', State: 'Enabled', HostedContentFilterPolicy: 'Std1' }] };
  assert.equal(protectionFor(spam, strict, who).applies, 'Strict preset security policy');
  assert.equal(protectionFor(spam, { spamPolicy: base.spamPolicy, spamRule: [] }, who).source, 'default');
  const off = { ...base, spamRule: base.spamRule.map(r => ({ ...r, State: 'Disabled' })) };
  assert.match(protectionFor(spam, off, who).checked.join(' '), /turned off/);
  assert.equal(protectionFor(links, { safeLinksPolicy: [{ Name: 'Built-In Protection Policy', IsBuiltInProtection: true }], safeLinksRule: [], builtIn: [{ Name: 'ATP Built-In Protection Rule', State: 'Enabled' }] }, who).source, 'builtIn');
  assert.equal(protectionFor(links, { safeLinksPolicy: [], safeLinksRule: [] }, who).applies, null);
});

test('mail flow rules say whether they act on mail to, from, or anyone', () => {
  assert.equal(transportRuleFor({ Name: 'a', State: 'Enabled', SentTo: ['pat@contoso.com'] }, who).reach, 'to');
  assert.equal(transportRuleFor({ Name: 'b', State: 'Enabled', FromMemberOf: ['finance@contoso.com'] }, who).reach, 'from');
  assert.equal(transportRuleFor({ Name: 'c', State: 'Enabled', FromScope: 'NotInOrganization' }, who).reach, 'everyone');
  const off = transportRuleFor({ Name: 'd', State: 'Disabled', SentTo: ['pat@contoso.com'] }, who);
  assert.equal(off.applies, false);
  assert.match(off.why, /turned off/);
  assert.equal(transportRuleFor({ Name: 'e', State: 'Enabled', Mode: 'Audit', SentTo: ['pat@contoso.com'] }, who).applies, false);
});

test('holds, DLP and Conditional Access are explained for one user', () => {
  const holds = decodeHolds(['mbxabc:1', '-mbxdef:2', 'UniH1234', 'cld999'], { retention: [{ guid: 'abc', name: 'Keep 7' }] });
  assert.match(holds[0].words, /Keep 7/);
  assert.equal(holds[1].excluded, true);
  assert.match(holds[2].kind, /eDiscovery/);
  const dlp = dlpFor([{ Name: 'Cards', Mode: 'TestWithNotifications', Workload: 'Exchange', ExchangeLocation: ['All'] }, { Name: 'Teams only', Workload: 'Teams', ExchangeLocation: ['All'] }], who);
  assert.equal(dlp.length, 1);
  assert.match(dlp[0].why, /test mode/);
  const ca = conditionalAccessFor([{ displayName: 'MFA', state: 'enabled', conditions: { users: { includeGroups: ['g1'] }, applications: { includeApplications: ['Office365'] } }, grantControls: { builtInControls: ['mfa'] } }], who, 'u1');
  assert.equal(ca[0].applies, true);
  assert.match(ca[0].effect, /multifactor/);
});

test('demo report covers everything that affects the user, in plain words', () => {
  const megan = demo('megan.bowen@contoso.com');
  for (const id of ['glance', 'account', 'mailbox', 'addresses', 'delivery', 'rules', 'delegation', 'groups', 'transport', 'protection', 'connectors', 'access', 'governance', 'ca', 'signins', 'trace', 'alerts', 'limits']) assert.ok(section(megan, id), id);
  assert.match(allText(megan), /forwarded to megan\.bowen@northwind\.example/);
  assert.match(allText(megan), /5\.7\.520/);
  assert.match(JSON.stringify(section(megan, 'protection')), /Safe Links standard/);
  assert.match(JSON.stringify(section(megan, 'governance')), /North custodians/);
  assert.match(JSON.stringify(section(megan, 'transport')), /Disclaimer on Sales/);
  const adele = demo('adele.vance@contoso.com');
  assert.match(JSON.stringify(section(adele, 'protection')), /Strict preset security policy/);
  assert.match(JSON.stringify(section(adele, 'glance')), /Litigation hold is on/);
  for (const s of megan.sections.filter(x => x.id !== 'glance' && x.id !== 'limits')) assert.ok(s.portals.length, `${s.id} links to a portal`);
});

test('anything that cannot be read says Not authorized where it would have been', () => {
  const report = buildMailboxReport({
    source: 'live', requested: 'pat@contoso.com', signedInAs: 'reader@contoso.com',
    graph: { user: { ok: true, json: { id: 'u1', displayName: 'Pat', userPrincipalName: 'pat@contoso.com', mail: 'pat@contoso.com' } }, licenses: notAuthorized('users'), groups: notAuthorized('directory'), signIns: notAuthorized('signins'), ca: notAuthorized('policy'), alerts: notAuthorized('alerts') },
    exo: notAuthorized('exchange'),
    ipps: undefined,
  });
  for (const id of ['mailbox', 'delivery', 'rules', 'delegation', 'transport', 'protection', 'access', 'governance', 'ca', 'signins', 'trace', 'alerts']) {
    assert.ok(section(report, id).blocks.some(b => b.type === 'denied' && b.label === 'Not authorized'), id);
  }
  assert.match(JSON.stringify(section(report, 'glance')), /could not be read with your permissions/);
  const pdf = reportPdf(report).toString('latin1');
  assert.match(pdf, /NOT AUTHORIZED/);
});

test('a refused or missing PowerShell read keeps its reason', () => {
  const bundle = { ok: true, commands: [{ ok: false, name: 'safeLinksRule', error: "The term 'Get-SafeLinksRule' is not recognized" }, { ok: false, name: 'archiveStats', error: "The archive couldn't be found." }, { ok: false, name: 'rules', error: 'Access Denied' }] };
  assert.equal(command(bundle, 'safeLinksRule').label, 'License required');
  assert.deepEqual(command(bundle, 'archiveStats').value, []);
  assert.equal(command(bundle, 'rules').label, 'Not authorized');
});

test('the PDF is a valid file with bookmarks, page numbers and the same sections', () => {
  const report = demo('megan.bowen@contoso.com');
  const buf = reportPdf(report);
  const raw = buf.toString('latin1');
  assert.ok(raw.startsWith('%PDF-1.4'));
  assert.ok(raw.trimEnd().endsWith('%%EOF'));
  const start = Number(raw.match(/startxref\n(\d+)/)[1]);
  assert.equal(raw.slice(start, start + 4), 'xref');
  for (const m of raw.slice(start).matchAll(/^(\d{10}) 00000 n $/gm)) assert.match(raw.slice(Number(m[1]), Number(m[1]) + 12), /^\d+ 0 obj/);
  assert.match(raw, /\/Outlines/);
  assert.match(raw, /Page 1 of \d+/);
  for (const s of report.sections) assert.ok(raw.includes(`(${s.title.replace(/[()]/g, '')}`) || raw.includes(s.title.split(' ')[0]), s.title);
  assert.equal(reportFileName(report), 'Ex360-mailbox-report-megan.bowen-2026-11-18-DEMO.pdf');
});

test('PDF text wraps to the width and maps typography to WinAnsi', () => {
  assert.equal(winAnsi('a — b “c” é ✓ 日'), 'a \x97 b \x93c\x94 \xe9 Yes ?');
  const lines = wrap('word '.repeat(60), 200, 10);
  assert.ok(lines.length > 3);
  assert.ok(wrap('x'.repeat(400), 100, 10).length > 1, 'long words are split');
  assert.deepEqual(wrap('one\ntwo', 400, 10), ['one', 'two']);
});

test('the report reads are Get- only and the PDF is never written to disk', () => {
  const ps = readFileSync(new URL('../server/Invoke-Ex360Command.ps1', import.meta.url), 'utf8');
  assert.match(ps, /\$Mode -eq 'report'/);
  assert.match(ps, /\$Mode -eq 'govern'/);
  const server = readFileSync(new URL('../server/report.mjs', import.meta.url), 'utf8') + readFileSync(new URL('../server/index.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(server, /writeFile[^\n]*pdf/i);
  assert.match(readFileSync(new URL('../.gitignore', import.meta.url), 'utf8'), /\*\.pdf/);
});
