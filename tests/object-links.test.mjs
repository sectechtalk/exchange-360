import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { portalLinks, linkTitle, recipientKind, FIND_PAGES } from '../lib/object-links.js';
import { matchesRecipient } from '../lib/recipients.js';

const ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const urls = out => out.links.map(l => l.url);

test('a mailbox links to every portal that changes it, at least Microsoft 365 admin center and Entra', () => {
  const out = portalLinks('mailbox', { id: ID, upn: 'megan.bowen@contoso.com' });
  assert.ok(urls(out).includes(`https://admin.cloud.microsoft/#/users/:/UserDetails/${ID}`));
  assert.ok(urls(out).includes(`https://entra.microsoft.com/#view/Microsoft_AAD_UsersAndTenants/UserProfileMenuBlade/~/overview/userId/${ID}`));
  assert.ok(out.links.some(l => l.short === 'Azure portal' && l.direct));
  assert.ok(out.links.some(l => l.short === 'Intune' && l.direct));
  assert.ok(out.links.some(l => l.short === 'Defender' && l.direct));
  assert.ok(out.links.some(l => l.short === 'Exchange admin center' && !l.direct));
});

test('no link goes to Graph', () => {
  for (const kind of ['mailbox', 'resource', 'group', 'm365group', 'contact', 'domain', 'sku', 'servicePrincipal', 'caPolicy', 'entraRole', 'signIn', 'alert', 'incident', 'healthIssue', ...Object.keys(FIND_PAGES)]) {
    for (const l of portalLinks(kind, { id: ID, name: 'contoso.com', skuId: ID }).links) assert.doesNotMatch(l.url, /graph/i, `${kind} ${l.url}`);
  }
});

test('a portal that cannot open the object says find it here and names it', () => {
  const rule = portalLinks('transportRule').links[0];
  assert.equal(rule.direct, false);
  assert.equal(rule.url, 'https://admin.exchange.microsoft.com/#/transportrules');
  assert.equal(linkTitle(rule, 'Flag external spoof'), 'Exchange admin center: find "Flag external spoof" here, under Mail flow > Rules');
});

test('groups link by object ID; Microsoft 365 groups add Teams; dynamic lists are Exchange only', () => {
  assert.ok(urls(portalLinks('group', { id: ID })).some(u => u.endsWith(`GroupDetailsMenuBlade/~/Overview/groupId/${ID}`)));
  assert.ok(urls(portalLinks('m365group', { id: ID })).includes(`https://admin.teams.microsoft.com/teams/manage/${ID}`));
  assert.ok(portalLinks('dynamicGroup').links.every(l => l.url.startsWith('https://admin.exchange.microsoft.com')));
});

test('missing IDs fall back to find-it pages, PowerShell-only settings say so', () => {
  const out = portalLinks('mailbox', { id: 'megan.bowen@contoso.com' });
  assert.ok(out.links.length >= 1 && out.links.every(l => !l.direct));
  assert.match(portalLinks('authPolicy').note, /Set-AuthenticationPolicy/);
  assert.equal(portalLinks('authPolicy').links.length, 0);
});

test('domains, licenses and service health open the one object', () => {
  assert.equal(portalLinks('domain', { name: 'Contoso.com' }).links[0].url, 'https://admin.cloud.microsoft/#/Domains/Details/contoso.com');
  assert.match(portalLinks('sku', { skuId: ID }).links[0].url, new RegExp(`licensedetailpage\\?skuid=${ID}$`));
  assert.equal(portalLinks('healthIssue', { id: 'EX123456' }).links[0].url, 'https://admin.cloud.microsoft/#/servicehealth/:/alerts/EX123456');
});

test('recipient kinds follow the Exchange recipient type', () => {
  assert.equal(recipientKind({ source: 'user', type: 'UserMailbox' }), 'mailbox');
  assert.equal(recipientKind({ source: 'exo', type: 'RoomMailbox' }), 'resource');
  assert.equal(recipientKind({ source: 'group', type: 'GroupMailbox' }), 'm365group');
  assert.equal(recipientKind({ source: 'exo', type: 'DynamicDistributionGroup' }), 'dynamicGroup');
  assert.equal(recipientKind({ source: 'contact', type: 'MailContact' }), 'contact');
  assert.equal(recipientKind({ source: 'exo', type: 'PublicFolder' }), 'publicFolder');
});

test('recipient lists wait for a search; an empty search lists everything', () => {
  const row = { DisplayName: 'Board Room', PrimarySmtpAddress: 'boardroom@contoso.com' };
  assert.equal(matchesRecipient(row, ''), true);
  assert.equal(matchesRecipient(row, 'board'), true);
  assert.equal(matchesRecipient(row, 'ROOM@'), true);
  assert.equal(matchesRecipient(row, 'projector'), false);
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const list = app.slice(app.indexOf('function renderRecipientList'), app.indexOf('function statusCell'));
  assert.ok(list.indexOf('recipientsData()') > list.indexOf("addEventListener('submit'"), 'recipients are read only after Search');
});

test('every object table names its object with objCell, and nothing links to Graph', () => {
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /graph-explorer|graphExplorer|exoCell\(/);
  for (const header of ["['Display name', 'Email address', 'Recipient type']", "['Status', 'Name', 'From', 'To']", "['Name', 'Remote domain']", "['Name', 'Available licenses', 'Assigned licenses', 'Account type']", "['Name', 'Application ID', 'Object ID'"]) {
    const at = app.indexOf(header);
    assert.ok(at > 0, header);
    assert.match(app.slice(at, at + 400), /objCell\(|xc\('|pickCell\(/, header);
  }
});

test('Microsoft 365 admin center group links open the one group under its own tab', () => {
  const m365 = l => urls(l).find(u => u.startsWith('https://admin.cloud.microsoft/'));
  assert.equal(m365(portalLinks('group', { id: ID, type: 'MailUniversalDistributionGroup' })), `https://admin.cloud.microsoft/#/groups/_/DistributionList/:/GroupDetails/${ID}/2`);
  assert.equal(m365(portalLinks('group', { id: ID, type: 'MailUniversalSecurityGroup' })), `https://admin.cloud.microsoft/#/groups/_/CombinedSecurityGroup/:/GroupDetails/${ID}/1`);
  assert.equal(m365(portalLinks('group', { id: ID, type: 'security' })), `https://admin.cloud.microsoft/#/groups/_/CombinedSecurityGroup/:/GroupDetails/${ID}/1`);
  assert.equal(m365(portalLinks('m365group', { id: ID })), `https://admin.cloud.microsoft/#/groups/_/UnifiedGroup/:/GroupDetails/${ID}/0`);
  assert.ok(urls(portalLinks('group', { id: ID, type: 'MailUniversalDistributionGroup' })).includes(`https://admin.exchange.microsoft.com/#/groups/:/GroupDetails/${ID}/2`));
  // Unknown kind: never a details link that would show another tab's settings, only the list page.
  const unknown = portalLinks('group', { id: ID }).links.find(l => l.url.startsWith('https://admin.cloud.microsoft/'));
  assert.equal(unknown.direct, false);
  assert.equal(unknown.url, 'https://admin.cloud.microsoft/#/groups');
});

test('a recipient search result selects the recipient; its portal chips still open the portals', () => {
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const at = app.indexOf('function pickCell(r)');
  assert.ok(at > 0);
  const body = app.slice(at, at + 700);
  assert.match(body, /objCell\(r\.displayName/);
  assert.match(body, /href: '#mb-recipient'/);
  assert.match(body, /openRecipient\(r\)/);
  assert.match(body, /name\.replaceWith\(select\)/);
  assert.equal((app.match(/h2\('Pick a recipient'\)/g) || []).length, 1, '"Pick a recipient" shows once');
});
