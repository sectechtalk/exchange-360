// Recipient properties (any mail-enabled recipient), the removed Organization pages, and page-change speed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PAGES, isPage } from '../lib/pages.js';
import { pageApplies, reportApplies, recipientType, graphGroupType, PAGE_SCOPE } from '../lib/recipient-types.js';
import { buildMailboxView } from '../lib/mailbox.js';
import { DEMO_ORG, DEMO_RECIPIENTS, demoRecipient } from '../lib/demo.js';
import { mailboxFromReads } from '../server/live.mjs';
import { userRoleWords, entraExchangeRoles, splitAssignments, assignmentScope } from '../lib/roles.js';
import { DEMO_COMPLIANCE } from '../lib/demo-compliance.js';

const root = path.resolve(import.meta.dirname, '..');
const read = file => readFileSync(path.join(root, file), 'utf8');
const pwsh = process.env.EX360_PWSH || 'pwsh';
const hasPwsh = spawnSync(pwsh, ['-NoProfile', '-Command', '1'], { encoding: 'utf8' }).status === 0;

test('Org summary and Organization report are gone from the rail, the routes and the server', () => {
  assert.equal(isPage('org'), false);
  assert.equal(isPage('org-report'), false);
  const html = read('public/index.html');
  assert.doesNotMatch(html, /data-view="org"|data-view="org-report"|Org summary|Organization report/);
  assert.doesNotMatch(read('server/index.mjs'), /org-report/);
  assert.doesNotMatch(read('public/app.js'), /org-report|renderOrg\b|renderOrgReport/);
});

test('Licenses no longer has "What each plan unlocks in Ex360"', () => {
  assert.doesNotMatch(read('public/app.js'), /What each plan unlocks/);
  assert.doesNotMatch(PAGES.find(p => p.id === 'licenses').blurb, /unlock/i);
});

test('the recipient section is SINGLE RECIPIENT, in the rail and in the page list', () => {
  const html = read('public/index.html');
  assert.match(html, /<span>SINGLE RECIPIENT<\/span>/);
  assert.doesNotMatch(html, /<span>(MAILBOX|RECIPIENT PROPERTIES)<\/span>/);
  assert.ok(PAGES.filter(p => p.id.startsWith('mb-')).every(p => p.section === 'Single recipient'));
  // Every rail link is a real page and every page is in the rail.
  const railIds = [...html.matchAll(/data-view="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual([...railIds].sort(), PAGES.map(p => p.id).sort());
});

test('recipient types use the Exchange admin center labels', () => {
  assert.equal(recipientType('GroupMailbox').label, 'Microsoft 365 group');
  assert.equal(recipientType('MailUniversalDistributionGroup').label, 'Distribution list');
  assert.equal(recipientType('MailUniversalSecurityGroup').label, 'Mail-enabled security group');
  assert.equal(recipientType('MailContact').kind, 'contact');
  assert.equal(recipientType('MailUser').kind, 'mailuser');
  assert.equal(recipientType('SharedMailbox').kind, 'mailbox');
  assert.equal(graphGroupType({ groupTypes: ['Unified'], mailEnabled: true }), 'GroupMailbox');
  assert.equal(graphGroupType({ groupTypes: [], mailEnabled: true, securityEnabled: true }), 'MailUniversalSecurityGroup');
  assert.equal(graphGroupType({ groupTypes: [], mailEnabled: true, securityEnabled: false }), 'MailUniversalDistributionGroup');
});

test('pages that do not apply to a recipient type say so, with a reason', () => {
  for (const id of Object.keys(PAGE_SCOPE)) assert.ok(isPage(id), id);
  for (const id of Object.keys(PAGE_SCOPE)) assert.equal(pageApplies(id, 'mailbox').applies, true, `${id} applies to a mailbox`);
  for (const kind of ['m365group', 'group', 'contact', 'mailuser', 'publicfolder']) {
    for (const id of ['mb-recipient', 'mb-groups', 'mb-policies', 'mb-findings']) assert.equal(pageApplies(id, kind).applies, true, `${id} for ${kind}`);
    for (const id of ['mb-forward', 'mb-rules', 'mb-protocols']) {
      const v = pageApplies(id, kind);
      assert.equal(v.applies, false, `${id} for ${kind}`);
      assert.ok(v.reason.length > 30);
    }
  }
  assert.equal(pageApplies('mb-delegation', 'm365group').applies, true);
  assert.equal(pageApplies('mb-delegation', 'contact').applies, false);
  assert.equal(pageApplies('mb-signins', 'group').applies, false);
  assert.equal(pageApplies('mb-signins', 'mailuser').applies, true);
  assert.equal(pageApplies('mb-compliance', 'm365group').applies, true);
  assert.equal(reportApplies('group'), false);
  assert.equal(reportApplies('mailbox'), true);
  assert.equal(pageApplies('mb-delegation', 'publicfolder').applies, true);
});

test('demo has a Microsoft 365 group, a distribution list, a mail contact and a mail user', () => {
  const types = DEMO_RECIPIENTS.map(r => r.type);
  for (const t of ['GroupMailbox', 'MailUniversalDistributionGroup', 'MailContact', 'MailUser']) assert.ok(types.includes(t), t);
  const view = buildMailboxView(DEMO_ORG, demoRecipient('allstaff@contoso.com'));
  assert.equal(view.mailbox.kind, 'group');
  assert.equal(view.mailbox.typeLabel, 'Distribution list');
  assert.equal(view.mailbox.members.length, 3);
  assert.ok(view.findings.some(f => /Only some senders/.test(f.title)));
  assert.equal(buildMailboxView(DEMO_ORG, demoRecipient('megan.bowen@contoso.com')).mailbox.kind, 'mailbox');
});

test('an Exchange read of a group is shaped as a group, not a broken mailbox', () => {
  const exo = { ok: true, commands: [
    { ok: true, name: 'recipient', value: [{ DisplayName: 'Marketing', PrimarySmtpAddress: 'marketing@contoso.com', RecipientTypeDetails: 'GroupMailbox', EmailAddresses: 'SMTP:marketing@contoso.com', HiddenFromAddressListsEnabled: false }] },
    { ok: true, name: 'sendas', value: [] },
    { ok: true, name: 'group', value: [{ AccessType: 'Private', RequireSenderAuthenticationEnabled: false, AcceptMessagesOnlyFromSendersOrMembers: null, GrantSendOnBehalfTo: 'Adele Vance' }] },
    { ok: true, name: 'members', value: [{ Name: 'Megan Bowen', PrimarySmtpAddress: 'megan@contoso.com', RecipientTypeDetails: 'UserMailbox' }] },
    { ok: false, name: 'owners', error: 'Access Denied' },
  ] };
  const r = mailboxFromReads({ id: 'g1', displayName: 'Marketing', mail: 'marketing@contoso.com' }, { ok: true, value: [] }, exo);
  assert.equal(r.kind, 'm365group');
  assert.equal(r.typeLabel, 'Microsoft 365 group');
  assert.deepEqual(r.aliases, ['SMTP:marketing@contoso.com']);
  assert.equal(r.members[0].address, 'megan@contoso.com');
  assert.equal(r.ownersError.authorized, false, 'a refused read shows Not authorized, not "no owner"');
  assert.deepEqual(r.sendOnBehalf, [{ name: 'Adele Vance' }]);
  assert.equal(r.group.requireSenderAuth, false);
  const view = buildMailboxView(DEMO_ORG, r);
  assert.ok(view.findings.some(f => /outside the organization can send/.test(f.title)));
});

function runMode(mode, args) {
  const dir = mkdtempSync(path.join(tmpdir(), 'ex360-test-'));
  try {
    writeFileSync(path.join(dir, 'token'), 'fake-token');
    writeFileSync(path.join(dir, 'args.json'), JSON.stringify(args));
    const res = spawnSync(pwsh, ['-NoProfile', '-NonInteractive', '-File', path.join(root, 'server', 'Invoke-Ex360Command.ps1'), '-TokenPath', path.join(dir, 'token'), '-Organization', 'contoso.onmicrosoft.com', '-UserPrincipalName', 'alex@contoso.com', '-Mode', mode, '-ArgsPath', path.join(dir, 'args.json')], {
      encoding: 'utf8', env: { ...process.env, PSModulePath: path.join(root, 'tests', 'fixtures', 'fake-exo') },
    });
    return JSON.parse(res.stdout);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('mailbox mode reads each recipient type with only the cmdlets that apply to it', { skip: !hasPwsh && 'pwsh not installed' }, () => {
  const names = id => runMode('mailbox', { identity: id }).commands.map(c => `${c.name}:${c.ok}`);
  assert.deepEqual(names('marketing@contoso.com'), ['recipient:true', 'sendas:true', 'group:true', 'members:true', 'owners:true', 'stats:true']);
  assert.deepEqual(names('allstaff@contoso.com'), ['recipient:true', 'sendas:true', 'group:true', 'members:true']);
  assert.deepEqual(names('billing@fabrikam.example'), ['recipient:true']);
  assert.deepEqual(names('pat.contractor@contoso.com'), ['recipient:true', 'sendas:true', 'mailuser:true', 'userAuth:true']);
  const box = names('alex@contoso.com');
  assert.equal(box[0], 'recipient:true');
  assert.ok(box.includes('mailbox:true') && box.includes('cas:true'));
  const contact = mailboxFromReads({ id: 'c1', displayName: 'Fabrikam Billing', mail: 'billing@fabrikam.example' }, { ok: true, value: [] }, runMode('mailbox', { identity: 'billing@fabrikam.example' }));
  assert.equal(contact.kind, 'contact');
  assert.equal(contact.externalAddress, 'billing@fabrikam.example');
});

test('the mailbox mode is still read-only', () => {
  const ps = read('server/Invoke-Ex360Command.ps1');
  const block = ps.slice(ps.indexOf("$Mode -eq 'mailbox'"), ps.indexOf("$Mode -eq 'report'"));
  const verbs = [...block.matchAll(/\b([A-Z][a-z]+)-(?:[A-Z][A-Za-z]+)\b/g)].map(m => m[1]);
  for (const verb of verbs) assert.ok(['Get', 'Select', 'Where', 'ForEach', 'Invoke'].includes(verb), verb);
});

test('page changes keep what was already read and render one time', () => {
  const app = read('public/app.js');
  assert.doesNotMatch(app, /onViewChange\(/, 'the old handler threw away every cached read on each page change');
  assert.equal((app.match(/addEventListener\('hashchange'/g) || []).length, 1, 'one hashchange listener, one render per page change');
  assert.match(app, /shared\(`\/api\/org\$\{demoQuery\(\)\}`\)/, 'organization data comes from the shared cache');
  assert.match(app, /pageEl\.replaceChildren\(loadingPanel\(id\)\)/, 'a loading state is drawn at once');
  assert.match(app, /if \(seq !== renderSeq\) throw STALE/, 'a late read never draws over a newer page');
  assert.match(read('public/index.html'), /id="refresh-data"/, 'Read again is the way to fetch fresh data');
});

const port = 8392;
test('demo server: recipient search lists groups and contacts, and opens each type', async () => {
  const child = spawn(process.execPath, ['server/index.mjs'], { cwd: root, env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', EX360_DEMO: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server did not start')), 8000);
    child.stdout.on('data', chunk => { if (String(chunk).includes('listening')) { clearTimeout(timer); resolve(); } });
    child.on('exit', code => { clearTimeout(timer); reject(new Error(`exited ${code}`)); });
  });
  try {
    const base = `http://127.0.0.1:${port}`;
    const all = await (await fetch(`${base}/api/mailboxes?q=&demo=1`)).json();
    const labels = all.value.map(r => r.typeLabel);
    for (const l of ['User mailbox', 'Shared mailbox', 'Room mailbox', 'Microsoft 365 group', 'Distribution list', 'Mail contact', 'Mail user']) assert.ok(labels.includes(l), l);
    const group = await (await fetch(`${base}/api/mailbox?id=marketing@contoso.com&demo=1`)).json();
    assert.equal(group.view.mailbox.typeLabel, 'Microsoft 365 group');
    assert.equal(group.view.mailbox.owners.length, 1);
    const contact = await (await fetch(`${base}/api/mailbox?id=billing@fabrikam.example&demo=1`)).json();
    assert.equal(contact.view.mailbox.kind, 'contact');
    assert.equal((await fetch(`${base}/api/org-report?demo=1`)).status, 404);
  } finally { child.kill(); }
});

test('every COMPLIANCE page is organization-wide: Compliance and Auditing/Logging groups under ORGANIZATION', () => {
  const html = read('public/index.html');
  assert.doesNotMatch(html, /<span>COMPLIANCE<\/span>/);
  assert.match(html, /class="nav-group nav-item"[^>]*data-group="compliance"/);
  for (const id of ['dlp', 'labels', 'retention-cc', 'ediscovery', 'compliance-admin']) {
    const page = PAGES.find(p => p.id === id);
    assert.equal(page.section, 'Organization', id);
    assert.equal(page.group, 'Compliance', id);
    assert.match(html, new RegExp(`data-view="${id}" class="nav-item nav-child"`), id);
  }
  // The per-recipient compliance page stays under Single recipient.
  assert.equal(PAGES.find(p => p.id === 'mb-compliance').section, 'Single recipient');
  // The rail lists the Compliance children right after the group button.
  const rail = [...html.matchAll(/data-(?:view|group)="([^"]+)"/g)].map(m => m[1]);
  const at = rail.indexOf('compliance');
  assert.deepEqual(rail.slice(at + 1, at + 6), ['dlp', 'labels', 'retention-cc', 'ediscovery', 'compliance-admin']);
  // Auditing and logging: the unified audit log and the Exchange admin audit log.
  const logs = rail.indexOf('auditing-logging');
  assert.deepEqual(rail.slice(logs + 1, logs + 3), ['audit', 'changes']);
  for (const id of ['audit', 'changes']) assert.equal(PAGES.find(p => p.id === id).group, 'Auditing/Logging', id);
  assert.match(read('public/nav-sections.js'), /nav-group-collapsed/);
});

test('Organization > Access and assignments holds User roles, Admin roles, Role assignments and scopes, and App access', () => {
  const ids = PAGES.map(p => p.id);
  const at = ids.indexOf('user-roles');
  assert.deepEqual(ids.slice(at, at + 4), ['user-roles', 'admin-roles', 'role-assignments', 'app-rbac']);
  for (const id of ids.slice(at, at + 4)) assert.equal(PAGES.find(p => p.id === id).group, 'Access and assignments', id);
  const rail = [...read('public/index.html').matchAll(/data-(?:view|group)="([^"]+)"/g)].map(m => m[1]);
  const g = rail.indexOf('access-and-assignments');
  assert.deepEqual(rail.slice(g + 1, g + 5), ['user-roles', 'admin-roles', 'role-assignments', 'app-rbac']);
  const ps = read('server/Invoke-Ex360Command.ps1');
  const block = ps.slice(ps.indexOf("$Mode -eq 'exoroles'"), ps.indexOf("$Mode -eq 'adminaudit'"));
  for (const c of ['Get-RoleGroup', 'Get-RoleAssignmentPolicy', 'Get-ManagementRoleAssignment', 'Get-ManagementScope', 'Get-ServicePrincipal', 'Get-Ex360AppAccessPolicies']) assert.match(block, new RegExp(c), c);
  assert.match(ps, /function Get-Ex360AppAccessPolicies \{\s*try \{ Get-ApplicationAccessPolicy -ErrorAction Stop \}/);
  assert.doesNotMatch(block, /\b(Set|New|Remove|Add|Enable|Disable|Update|Test)-/);
});

test('roles in plain words', () => {
  assert.match(userRoleWords('MyDistributionGroups'), /distribution groups they own/);
  assert.match(userRoleWords('Default Role Assignment Policy\\My Custom Apps'), /custom add-ins/);
  const entra = entraExchangeRoles([{ displayName: 'Exchange Administrator', members: [] }, { displayName: 'Teams Administrator', members: [] }, { displayName: 'Global Reader', members: [] }]);
  assert.deepEqual(entra.map(r => r.name), ['Exchange Administrator', 'Global Reader']);
  const split = splitAssignments(DEMO_COMPLIANCE.roleAssignments);
  assert.equal(split.app.length, 1);
  assert.equal(assignmentScope(split.app[0]), 'Room mailboxes');
  assert.equal(split.user[0].Role, 'MyBaseOptions');
  assert.equal(split.direct.length, 0);
  assert.deepEqual(splitAssignments({ ok: false }).admin, { ok: false });
});

test('exoroles mode returns every role read', { skip: !hasPwsh && 'pwsh not installed' }, () => {
  const out = runMode('exoroles', {});
  assert.deepEqual(out.commands.map(c => `${c.name}:${c.ok}`), ['groups:true', 'userRoles:true', 'assignments:true', 'scopes:true', 'servicePrincipals:true', 'appAccessPolicies:true']);
  assert.deepEqual(out.commands[1].value[0].AssignedRoles, ['MyBaseOptions', 'MyVoiceMail']);
  assert.deepEqual(out.commands[5].value, [], 'no application access policies reads as none, not as an error');
});

test('Recipient properties > Message trace is merged into Troubleshoot > Trace a message', () => {
  assert.equal(isPage('mb-trace'), false);
  assert.doesNotMatch(read('public/index.html'), /mb-trace/);
  const app = read('public/app.js');
  assert.doesNotMatch(app, /'mb-trace'/);
  assert.match(app, /#trace\?\$\{field\}=\$\{encodeURIComponent\(mailbox\.primary\)\}&days=10&run=1/, 'the Recipient pane opens Trace a message, filled in and run');
  assert.match(app, /traceLink\('recipient', 'Trace mail received'\)/);
  assert.match(app, /traceLink\('sender', 'Trace mail sent'\)/);
  assert.match(app, /form\.requestSubmit\(\)/);
});

test('Organization pages are in the set order, and On-premises is its own section', () => {
  const html = read('public/index.html');
  const org = html.slice(html.indexOf('data-section="organization"'), html.indexOf('data-section="single-recipient"'));
  const top = org.split('\n').filter(l => /class="nav-(item|group)/.test(l) && !/nav-child/.test(l)).map(l => (l.match(/data-view="([^"]+)"/) || l.match(/data-group="([^"]+)"/))[1]);
  assert.deepEqual(top, ['review', 'health', 'mailboxes', 'mail-enabled-groups', 'rules', 'access-and-assignments', 'compliance', 'security', 'domains', 'connectors', 'config', 'licenses', 'migrations', 'auditing-logging']);
  assert.doesNotMatch(org, /data-view="onprem"/);
  assert.match(html, /data-section="on-premises"><span>ON-PREMISES<\/span>[\s\S]*?data-view="onprem"/);
  assert.equal(PAGES.find(p => p.id === 'onprem').section, 'On-premises');
  // lib/pages.js keeps the same order as the rail.
  const railViews = [...html.matchAll(/data-view="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(PAGES.map(p => p.id), railViews);
});

test('every "Where this is changed" pane is collapsible and starts collapsed', () => {
  const app = read('public/app.js');
  assert.match(app, /el\('details', \{ class: 'panel stack where-changed' \}, el\('summary', \{\}, el\('h3', \{ text: `Where this is changed: /);
  assert.doesNotMatch(app, /panel\(el\('h3', \{ text: `Where this is changed/);
  assert.doesNotMatch(app, /where-changed' , open|where-changed', open: /);
  assert.match(read('public/styles.css'), /\.where-changed > summary/);
});

test('Security policies: Which policy wins on the parent, each kind of policy on its own page under it', () => {
  const html = read('public/index.html');
  const rail = [...html.matchAll(/data-view="([^"]+)"/g)].map(m => m[1]);
  const at = rail.indexOf('security');
  const kids = ['sec-antispam', 'sec-antiphish', 'sec-antimalware', 'sec-safelinks', 'sec-safeattach', 'sec-outbound', 'sec-connection', 'sec-quarantine'];
  assert.deepEqual(rail.slice(at + 1, at + 9), kids);
  for (const id of kids) assert.equal(PAGES.find(p => p.id === id).group, 'Security policies', id);
  assert.match(html, /data-group="security-policies" href="#security" data-view="security" class="nav-item nav-group"/);
  const app = read('public/app.js');
  const parent = app.slice(app.indexOf('function renderSecurity()'), app.indexOf('function renderSecurityArea('));
  assert.match(parent, /h2\('Which policy wins'\)/);
  assert.doesNotMatch(parent, /policyTable\(/, 'no policy panes on the parent page');
  assert.match(read('public/nav-sections.js'), /group\.tagName === 'A'/);
});

test('Anti-spam links go to /antispam and Quarantine policy links go to /quarantinePolicies', async () => {
  const { PORTALS } = await import('../lib/portals.js').catch(() => ({}));
  const portals = read('lib/portals.js');
  assert.doesNotMatch(portals + read('lib/object-links.js'), /quarantinepolicies/);
  assert.match(portals, /id: 'quarantine-policies',[\s\S]{0,200}link\('Microsoft Defender portal — quarantine policies', `\$\{DEFENDER\}\/quarantinePolicies`\)/);
  assert.match(portals, /id: 'anti-spam',[\s\S]{0,250}link\('Microsoft Defender portal — anti-spam', `\$\{DEFENDER\}\/antispam`\)/);
  const pane = read('lib/pane-portals.js');
  assert.match(pane, /'sec-antispam': 'anti-spam'/);
  assert.match(pane, /'sec-quarantine': 'quarantine-policies'/);
  void PORTALS;
});

test('no demo mode in the app: signed out, tenant pages ask you to sign in', () => {
  const app = read('public/app.js');
  assert.doesNotMatch(read('public/index.html'), /demo-toggle/);
  assert.match(app, /state\.demo = state\.session\.demo === true;/);
  assert.match(app, /if \(!state\.demo && !state\.session\.signedIn && !SIGNED_OUT_VIEWS\.has\(id\)\) \{ pageEl\.replaceChildren\(signInFirst\(id\)\); return; \}/);
  assert.match(read('server/index.mjs'), /demo: process\.env\.EX360_DEMO === '1',/);
});
