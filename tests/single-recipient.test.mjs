// Single recipient: one Recipient page, every inbound recipient type in the search, sign-ins capped at 10,
// and Organization > Service health with the status pages mail flow depends on.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PAGES, isPage } from '../lib/pages.js';
import { recipientType, pageApplies } from '../lib/recipient-types.js';
import { mergeExchangeRecipients, recipientFromReads } from '../server/live.mjs';
import { HEALTH_LINKS, HEALTH_SITES, portalsFor } from '../lib/portals.js';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('Everything for one recipient, Recipient pane and Recipient are one page: Single recipient > Recipient', () => {
  assert.equal(isPage('mb-report'), false);
  assert.equal(isPage('mailbox'), false);
  const page = PAGES.find(p => p.id === 'mb-recipient');
  assert.equal(page.title, 'Recipient');
  assert.equal(page.section, 'Single recipient');
  const app = read('public/app.js');
  assert.doesNotMatch(app, /Everything for one recipient/);
  assert.doesNotMatch(app, /Recipient pane/);
  // Old links still land on the merged page.
  assert.match(app, /LEGACY_VIEWS = \{ mailbox: 'mb-recipient', 'mb-report': 'mb-recipient'/);
});

test('the Recipient page leaves out what another Single recipient page already shows', () => {
  const app = read('public/app.js');
  const sections = app.match(/RECIPIENT_REPORT_SECTIONS = \[([^\]]+)\]/)[1];
  for (const covered of ['glance', 'rules', 'delegation', 'groups', 'transport', 'protection', 'connectors', 'access', 'governance', 'ca', 'signins', 'trace', 'alerts', 'addresses']) {
    assert.doesNotMatch(sections, new RegExp(`'${covered}'`), covered);
  }
  // The parts that moved off the page are shown where they belong.
  assert.match(app, /reportSlot\(\['transport', 'protection', 'connectors'\]\)/);
  assert.match(app, /reportSlot\(\['glance'\]/);
  assert.match(app, /reportSlot\(\['rules'\]/);
  // No Drill down list or findings summary repeating the rail and the Findings page.
  assert.doesNotMatch(app, /h2\('Drill down'\)/);
  assert.doesNotMatch(app, /h2\('What is going on'\)/);
});

test('the search covers every recipient that routes inbound mail, including Exchange-only ones', () => {
  assert.equal(recipientType('MailUniversalSecurityGroup').label, 'Mail-enabled security group');
  assert.equal(recipientType('DynamicDistributionGroup').kind, 'group');
  assert.equal(recipientType('RoomList').kind, 'group');
  assert.equal(recipientType('PublicFolder').kind, 'publicfolder');
  assert.equal(recipientType('PublicFolder').label, 'Mail-enabled public folder');
  const graph = [{ id: 'g1', source: 'group', displayName: 'Sales', primary: 'Sales@contoso.com', type: 'MailUniversalDistributionGroup', typeLabel: 'Distribution list' }];
  const exo = [
    { DisplayName: 'Sales', PrimarySmtpAddress: 'sales@contoso.com', RecipientTypeDetails: 'MailUniversalSecurityGroup' },
    { DisplayName: 'All Seattle', PrimarySmtpAddress: 'allseattle@contoso.com', RecipientTypeDetails: 'DynamicDistributionGroup' },
    { DisplayName: 'Support folder', PrimarySmtpAddress: 'support-pf@contoso.com', RecipientTypeDetails: 'PublicFolder' },
  ];
  const rows = mergeExchangeRecipients(graph, exo);
  assert.equal(rows.length, 3, 'the Graph row is not listed twice');
  assert.equal(rows[0].id, 'g1');
  assert.equal(rows[0].typeLabel, 'Mail-enabled security group', 'Exchange gives the exact type');
  assert.deepEqual(rows.slice(1).map(r => [r.source, r.id, r.typeLabel]), [['exo', 'allseattle@contoso.com', 'Dynamic distribution list'], ['exo', 'support-pf@contoso.com', 'Mail-enabled public folder']]);
});

test('the Exchange search and public folder reads are Get- only', () => {
  const ps = read('server/Invoke-Ex360Command.ps1');
  assert.match(ps, /'quarantine', 'search'/);
  const search = ps.slice(ps.indexOf("$Mode -eq 'search'"), ps.indexOf("$Mode -eq 'quarantine'"));
  assert.match(search, /Get-Recipient -Anr \$q/);
  for (const type of ['MailUniversalSecurityGroup', 'DynamicDistributionGroup', 'RoomList', 'PublicFolder', 'GroupMailbox', 'MailContact', 'MailUser']) assert.match(search, new RegExp(type));
  assert.doesNotMatch(search, /\b(Set|New|Remove|Add|Enable|Disable)-[A-Z]/);
  assert.match(ps, /Get-MailPublicFolder -Identity \$id/);
  assert.match(read('server/exo.mjs'), /'search'/);
  assert.match(read('server/index.mjs'), /\['user', 'group', 'contact', 'exo'\]/);
});

test('a mail-enabled public folder opens as a recipient with its forwarding and delivery settings', () => {
  const exo = { ok: true, commands: [
    { ok: true, name: 'recipient', value: [{ DisplayName: 'Support folder', PrimarySmtpAddress: 'support-pf@contoso.com', RecipientTypeDetails: 'PublicFolder', EmailAddresses: ['SMTP:support-pf@contoso.com'] }] },
    { ok: true, name: 'sendas', value: [] },
    { ok: true, name: 'group', value: [{ ForwardingAddress: 'helpdesk@contoso.com', DeliverToMailboxAndForward: true, RequireSenderAuthenticationEnabled: false, AcceptMessagesOnlyFromSendersOrMembers: [] }] },
  ] };
  const box = recipientFromReads({ id: 'support-pf@contoso.com', mail: 'support-pf@contoso.com' }, { ok: false, label: 'Not available', message: 'x' }, exo, exo.commands[0].value[0]);
  assert.equal(box.kind, 'publicfolder');
  assert.equal(box.forwarding.smtp, 'helpdesk@contoso.com');
  assert.equal(box.group.requireSenderAuth, false);
  assert.equal(pageApplies('mb-recipient', 'publicfolder').applies, true);
  assert.equal(pageApplies('mb-signins', 'publicfolder').applies, false);
});

test('Sign-ins shows the last 10 by default, with Show all', () => {
  const app = read('public/app.js');
  assert.match(app, /const SIGNINS_SHOWN = 10;/);
  assert.match(app, /all\.slice\(0, SIGNINS_SHOWN\)/);
  assert.match(app, /`Show all \$\{all\.length\}`/);
  assert.match(read('server/live.mjs'), /top = 50 \}/);
  assert.doesNotMatch(read('server/live.mjs'), /signIns\?[^`]*orderby/i);
});

test('Service health links the admin center page and the status pages that affect mail flow', () => {
  assert.equal(HEALTH_LINKS.m365, 'https://admin.cloud.microsoft/#/servicehealth');
  const urls = HEALTH_SITES.map(s => s.url);
  assert.ok(urls.includes('https://status.cloud.microsoft'));
  assert.ok(urls.includes('https://azure.status.microsoft/en-us/status'));
  assert.ok(urls.some(u => u.startsWith('https://portal.azure.com/#view/Microsoft_Azure_Health/')));
  for (const s of HEALTH_SITES) assert.ok(s.when.length > 40 && s.signIn, s.name);
  assert.equal(portalsFor('service-health').links[0].url, 'https://admin.cloud.microsoft/#/servicehealth');
  assert.equal(PAGES.find(p => p.id === 'health').section, 'Organization');
});
