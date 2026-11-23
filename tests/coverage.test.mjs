import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewTenant } from '../lib/review.js';
import { settingsFrom, demoOrgBundle, readError } from '../lib/org-settings.js';
import { shapeRecipients, demoRecipientsBundle, bookingWords } from '../lib/recipients.js';
import { explainStatus, explainEvent, traceVerdict, demoTrace, DEMO_TRACE } from '../lib/trace.js';
import { explainQuarantine, quarantineSummary, DEMO_QUARANTINE } from '../lib/quarantine.js';
import { shapeCompliance, sensitiveTypes, durationText, workloadList } from '../lib/compliance-shape.js';
import { DEMO_COMPLIANCE } from '../lib/demo-compliance.js';
import { DEMO_ORG } from '../lib/demo.js';
import { portalsFor } from '../lib/portals.js';

const demo = () => {
  const s = settingsFrom(demoOrgBundle());
  return reviewTenant({ settings: s.settings, errors: s.errors, domains: DEMO_ORG.domains, compliance: DEMO_COMPLIANCE, recipients: shapeRecipients(demoRecipientsBundle()), health: DEMO_ORG.health, defender: true });
};
const titles = r => r.areas.flatMap(a => a.findings.map(f => `${f.severity}|${f.title}`));

test('config review covers every job area on the demo tenant', () => {
  const r = demo();
  const ids = r.areas.map(a => a.id);
  for (const id of ['auth-dns', 'rules', 'connectors', 'anti-spam', 'anti-phish', 'defender', 'outbound', 'modern-auth', 'recipients', 'retention', 'purview', 'quarantine', 'health']) assert.ok(ids.includes(id), id);
  for (const a of r.areas) for (const f of a.findings) {
    assert.ok(['high', 'medium', 'low', 'info', 'ok'].includes(f.severity));
    assert.ok(f.title.length > 3);
  }
  for (const a of r.areas) for (const id of a.portals) assert.ok(portalsFor(id), `portal ${id}`);
});

test('config review catches the classic misconfigurations', () => {
  const t = titles(demo()).join('\n');
  assert.match(t, /high\|"Bypass spam filter for partner" skips spam filtering/);
  assert.match(t, /high\|fabrikam\.example has no SPF record/);
  assert.match(t, /medium\|contoso\.com DMARC is p=none/);
  assert.match(t, /high\|1 mailbox forwards by SMTP address/);
  assert.match(t, /medium\|1 shared mailbox allows direct sign-in/);
  assert.match(t, /medium\|DLP "Sales confidential" distribution is Pending/);
  assert.match(t, /ok\|MFA is required for Exchange/);
});

test('review flags off switches and stays quiet on good ones', () => {
  const settings = {
    org: [{ OAuth2ClientProfileEnabled: false, AuditDisabled: true }],
    transport: [{ SmtpClientAuthenticationDisabled: false }],
    auditConfig: [{ UnifiedAuditLogIngestionEnabled: false }],
    outboundPolicy: [{ Name: 'Default', IsDefault: true, AutoForwardingMode: 'On' }],
    phishPolicy: [{ Name: 'Office365 AntiPhish Default', IsDefault: true, EnableSpoofIntelligence: false, HonorDmarcPolicy: false }],
    safeLinksPolicy: [{ Name: 'SL', EnableSafeLinksForEmail: true, AllowClickThrough: true, ScanUrls: true }],
    safeAttachPolicy: [{ Name: 'SA', Enable: true, Action: 'Allow' }],
    spamPolicy: [{ Name: 'Default', IsDefault: true, AllowedSenderDomains: ['gmail.com'], AllowedSenderCount: 1, HighConfidencePhishAction: 'MoveToJmf' }],
    auth: [{ Name: 'Legacy', AllowBasicAuthSmtp: true }],
  };
  const t = titles(reviewTenant({ settings })).join('\n');
  for (const re of [/high\|Modern authentication is off/, /medium\|SMTP AUTH is allowed/, /high\|Unified audit logging is off/, /high\|Mailbox auditing is off/, /high\|Outbound policy "Default" allows automatic external forwarding/, /high\|Spoof intelligence is off/, /medium\|.*lets users click through/, /high\|.*Safe Attachments "SA" does not block/, /high\|.*allows sender domains: gmail\.com/, /high\|"Default" does not quarantine high-confidence phish/, /medium\|Authentication policy "Legacy" allows basic auth for Smtp/]) assert.match(t, re);
  const good = titles(reviewTenant({ settings: { org: [{ OAuth2ClientProfileEnabled: true }], transport: [{ SmtpClientAuthenticationDisabled: true }] } })).join('\n');
  assert.doesNotMatch(good, /high\||medium\|/);
});

test('a refused read becomes a Not authorized line, not an empty pass', () => {
  const s = settingsFrom({ ok: true, commands: [{ ok: false, name: 'rules', error: 'The user is not authorized to run Get-TransportRule' }, { ok: false, name: 'safeLinksPolicy', error: "The term 'Get-SafeLinksPolicy' is not recognized" }] });
  assert.equal(s.errors.rules.label, 'Not authorized');
  assert.equal(s.errors.safeLinksPolicy.label, 'License required');
  const r = reviewTenant({ settings: s.settings, errors: s.errors });
  const rules = r.areas.find(a => a.id === 'rules');
  assert.equal(rules.findings[0].label, 'Not authorized');
  const whole = settingsFrom({ ok: false, label: 'Not authorized', authorized: false, message: 'no' });
  assert.equal(whole.errors.org.label, 'Not authorized');
  assert.equal(readError('x', 'boom').label, 'Could not read');
});

test('recipients shape and booking words', () => {
  const r = shapeRecipients(demoRecipientsBundle());
  assert.equal(r.shared.length, 2);
  assert.equal(r.resources[0].Calendar.AutomateProcessing, 'AutoAccept');
  assert.match(bookingWords(r.resources[0].Calendar), /accepted or declined automatically.*sales-team@contoso\.com/);
  assert.match(bookingWords(r.resources[1].Calendar), /Nobody can book directly/);
  assert.match(bookingWords(null), /not read/);
});

test('message trace statuses and events in plain words', () => {
  assert.match(explainStatus('Delivered').next, /Junk Email/);
  assert.equal(explainStatus('FilteredAsSpam').tone, 'medium');
  assert.equal(explainStatus('Failed').tone, 'high');
  const ev = explainEvent({ Event: 'Fail', Detail: 'Reason: [{LED=550 5.7.1 Delivery not authorized}]' });
  assert.equal(ev.code, '550 5.7.1');
  const rule = explainEvent({ Event: 'Transport rule', Detail: 'x', Data: '<MEP Name="TransportRuleName" String="Block exe"/>' });
  assert.equal(rule.rule, 'Block exe');
  const dlp = demoTrace({ messageTraceId: DEMO_TRACE[2].MessageTraceId });
  const v = traceVerdict(dlp.commands.find(c => c.name === 'detail').value);
  assert.match(v.text, /Delivery failed\. Code 550 5\.7\.1\. Rule or policy involved: Sales confidential/);
  assert.equal(demoTrace({ sender: 'alex@fabrikam.example' }).commands[0].value.length, 2);
});

test('quarantine reasons and who can release', () => {
  const x = explainQuarantine(DEMO_QUARANTINE[0]);
  assert.equal(x.reason, 'Phishing');
  assert.match(explainQuarantine(DEMO_QUARANTINE[1]).release, /asked for release/);
  assert.match(explainQuarantine({ QuarantineTypes: 'HighConfPhish' }).release, /Only an admin/);
  assert.equal(quarantineSummary(DEMO_QUARANTINE).length, 3);
});

test('live Purview rows are shaped like the demo so the pages show them', () => {
  const ipps = { ok: true, commands: [
    { ok: true, name: 'dlpPolicies', value: [{ Name: 'PCI', Mode: 'Enable', Enabled: true, Workload: 'Exchange, SharePoint', ExchangeLocation: ['All'], DistributionStatus: 'Success' }] },
    { ok: true, name: 'dlpRules', value: [{ Name: 'Cards', ParentPolicyName: 'PCI', BlockAccess: true, NotifyUser: ['SiteAdmin'], AdvancedRule: '{"Sensitivetypes":[{"Name":"Credit Card Number","Mincount":1}]}' }] },
    { ok: true, name: 'retentionPolicies', value: [{ Name: 'Mail 7y', Enabled: true, Workload: 'Exchange', ExchangeLocation: ['All'] }] },
    { ok: true, name: 'retentionRules', value: [{ Policy: 'Mail 7y', RetentionDuration: 2555 }] },
    { ok: false, name: 'purviewRoles', error: 'Access Denied' },
  ] };
  const c = shapeCompliance(ipps);
  assert.deepEqual(c.dlp[0].workloads, ['Exchange', 'SharePoint']);
  assert.equal(c.dlp[0].scope, 'all');
  assert.deepEqual(c.dlp[0].rules, ['Cards']);
  assert.deepEqual(c.dlpRules[0].sensitiveTypes, ['Credit Card Number']);
  assert.equal(c.dlpRules[0].blocks, true);
  assert.equal(c.retentionPolicies[0].duration, '7 years');
  assert.equal(c.purviewRoles.label, 'Not authorized');
  assert.equal(durationText({ RetentionDuration: 30 }), '30 days');
  assert.deepEqual(workloadList('Exchange;Teams'), ['Exchange', 'Teams']);
  assert.deepEqual(sensitiveTypes({}), []);
});
