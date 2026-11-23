// MHTML report, the Exchange role check on Single recipient pages, Authentication policy words,
// and Organization > Mailboxes / Mail-enabled groups as one searchable table per page.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PAGES, isPage } from '../lib/pages.js';
import { reportHtml, reportMhtml, reportMhtmlFileName, quotedPrintable, escapeHtml } from '../lib/report-mhtml.js';
import { CHANGE_RIGHTS, ALL_CHANGE_CHECKS, rightsVerdict } from '../lib/change-rights.js';
import { authPolicyWords } from '../lib/auth-policy.js';
import { mailboxFromReads } from '../server/live.mjs';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const report = {
  title: 'Mailbox report: Megan <Bowen>', subject: { displayName: 'Megan Bowen', address: 'megan.bowen@contoso.com' },
  source: 'demo', generatedAt: '2026-11-21T20:00:00.000Z', generatedText: 'Nov 21, 2026', signedInAs: 'admin@contoso.com',
  sections: [{ id: 'account', title: 'Account', intro: 'Who this is.', portals: [{ title: 'Users', links: [{ name: 'Entra', url: 'https://entra.microsoft.com' }, { name: 'bad', url: 'javascript:alert(1)' }], powershell: 'Get-User megan' }],
    blocks: [{ type: 'facts', rows: [['Enabled', 'Yes', 'hint'], ['Café', '<script>', '']] }, { type: 'table', columns: ['A'], rows: [['1']] }, { type: 'list', items: [{ text: 'Forward on', tone: 'high' }] }, { type: 'denied', label: 'Not authorized', message: 'No role' }] }],
};

test('the MHTML report is one multipart/related HTML part with every section, escaped', () => {
  const html = reportHtml(report);
  assert.match(html, /<h2>1\. Account<\/h2>/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /javascript:/);
  assert.match(html, /<span class="tag high">HIGH<\/span>/);
  const mht = reportMhtml(report, { boundary: 'B' });
  assert.match(mht, /^From: <Saved by Exchange 360>\r\n/);
  assert.match(mht, /Content-Type: multipart\/related; type="text\/html"; boundary="B"/);
  assert.match(mht, /Content-Transfer-Encoding: quoted-printable/);
  assert.match(mht, /\r\n--B--\r\n$/);
  for (const line of mht.split('\r\n')) assert.ok(line.length <= 76, `line too long: ${line.length}`);
  assert.equal(reportMhtmlFileName(report), 'Ex360-mailbox-report-megan.bowen-2026-11-21-DEMO.mhtml');
  assert.equal(escapeHtml('"a"&'), '&quot;a&quot;&amp;');
});

test('quoted-printable round-trips UTF-8 and encodes = and trailing spaces', () => {
  const decode = qp => Buffer.from(qp.replace(/=\r\n/g, '').replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))), 'latin1').toString('utf8');
  const text = 'Café = 1 \nline two\t\n' + 'x'.repeat(200);
  assert.equal(decode(quotedPrintable(text)), text.replace(/\n/g, '\r\n'));
  assert.match(quotedPrintable('a=b'), /a=3Db/);
});

test('Recipient offers the MHTML report next to the PDF, and the server streams it without saving it', () => {
  assert.match(read('public/app.js'), /\/api\/report\.mhtml\?/);
  assert.match(read('public/app.js'), /downloadButton\('Download MHTML report'/);
  const server = read('server/index.mjs');
  assert.match(server, /url\.pathname === '\/api\/report\.mhtml'/);
  assert.match(server, /reportMhtml\(report\)/);
  assert.match(read('.gitignore'), /\*\.mhtml/);
});

test('Forwarding, Inbox rules, Member of, Delegation and Protocols check your Exchange role', () => {
  for (const id of ['mb-forward', 'mb-rules', 'mb-groups', 'mb-delegation', 'mb-protocols']) assert.ok(CHANGE_RIGHTS[id], id);
  for (const c of ALL_CHANGE_CHECKS) assert.match(c.cmdlet, /^(Set|New|Add|Remove|Enable|Disable)-[A-Za-z]+$/);
  assert.deepEqual(ALL_CHANGE_CHECKS.find(c => c.cmdlet === 'Set-Mailbox').params.sort(), ['DeliverToMailboxAndForward', 'ForwardingSmtpAddress', 'GrantSendOnBehalfTo']);
  const yes = rightsVerdict('mb-forward', [{ cmdlet: 'Set-Mailbox', available: true, missing: [] }]);
  assert.equal(yes.verdict, 'yes');
  const param = rightsVerdict('mb-forward', [{ cmdlet: 'Set-Mailbox', available: true, missing: ['ForwardingSmtpAddress'] }]);
  assert.equal(param.verdict, 'no');
  assert.match(param.lines[0].why, /not -ForwardingSmtpAddress/);
  const partly = rightsVerdict('mb-rules', [{ cmdlet: 'Set-InboxRule', available: true, missing: [] }, { cmdlet: 'Disable-InboxRule', available: false, missing: [] }]);
  assert.equal(partly.verdict, 'partly');
  assert.equal(rightsVerdict('mb-groups', []).verdict, 'no');
  // The PowerShell only asks Get-Command; it never runs the change cmdlets.
  const ps = read('server/Invoke-Ex360Command.ps1');
  const mode = ps.slice(ps.indexOf("$Mode -eq 'rights'"), ps.indexOf("$Mode -eq 'quarantine'"));
  assert.match(mode, /Get-Command -Name \$name/);
  assert.doesNotMatch(mode, /&\s*\$name|Invoke-Expression|\.Invoke\(/);
  assert.match(read('server/exo.mjs'), /'search', 'rights'\]/);
  assert.doesNotMatch(read('public/app.js'), /The portal checks your role\. Ex360 does not\./);
});

test('Authentication policy says which policy applies, never "Not returned"', () => {
  assert.match(authPolicyWords({ user: 'Block basic auth' }).label, /Block basic auth/);
  assert.match(authPolicyWords({ user: '', orgDefault: 'Org default' }).label, /Org default \(organization default\)/);
  assert.equal(authPolicyWords({ user: '', orgDefault: '' }).label, 'None');
  assert.equal(authPolicyWords({ userError: { message: 'denied' } }).label, 'Could not read');
  assert.doesNotMatch(read('public/app.js'), /'Not returned\.'/);
  const exo = { ok: true, commands: [
    { ok: true, name: 'recipient', value: [{ RecipientTypeDetails: 'UserMailbox' }] },
    { ok: true, name: 'mailbox', value: [{ RecipientTypeDetails: 'UserMailbox' }] },
    { ok: true, name: 'userAuth', value: [{ AuthenticationPolicy: '' }] },
    { ok: true, name: 'orgAuth', value: [{ DefaultAuthenticationPolicy: 'Block legacy' }] },
  ] };
  const box = mailboxFromReads({ id: 'u1', mail: 'u1@contoso.com' }, { ok: true, value: [] }, exo);
  assert.equal(box.authPolicy, '');
  assert.equal(box.orgAuthPolicy, 'Block legacy');
  assert.match(read('server/Invoke-Ex360Command.ps1'), /Invoke-Read 'orgAuth' \{ Get-OrganizationConfig/);
});

test('Recipients is split into one searchable table per page under Mailboxes and Mail-enabled groups', () => {
  assert.equal(isPage('recipients'), false);
  const want = { 'rcp-shared': 'Mailboxes', 'rcp-resources': 'Mailboxes', 'rcp-forwarding': 'Mailboxes', 'rcp-groups': 'Mail-enabled groups', 'rcp-dynamic': 'Mail-enabled groups', 'rcp-m365': 'Mail-enabled groups' };
  for (const [id, group] of Object.entries(want)) {
    const page = PAGES.find(p => p.id === id);
    assert.equal(page.section, 'Organization', id);
    assert.equal(page.group, group, id);
  }
  const html = read('public/index.html');
  const rail = [...html.matchAll(/data-(?:view|group)="([^"]+)"/g)].map(m => m[1]);
  const at = rail.indexOf('mailboxes');
  assert.deepEqual(rail.slice(at, at + 8), ['mailboxes', 'rcp-shared', 'rcp-resources', 'rcp-forwarding', 'mail-enabled-groups', 'rcp-groups', 'rcp-dynamic', 'rcp-m365']);
  const app = read('public/app.js');
  assert.match(app, /search: true, searchLabel: spec\.search/);
  assert.match(app, /recipients: 'rcp-shared'/);
  assert.doesNotMatch(app, /Mailboxes by type/);
});
