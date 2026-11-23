// Export-MailFlowConfig.ps1: the read-only tenant export that Exchange 360 and NextHop 360 read.
// Static checks always run. End-to-end checks run when pwsh is installed (GitHub's ubuntu runners have it).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const script = path.join(root, 'export', 'Export-MailFlowConfig.ps1');
const stubs = path.join(root, 'tests', 'fixtures', 'mailflow-stubs.ps1');
const schema = JSON.parse(readFileSync(path.join(root, 'docs', 'contracts', 'mailflow-config.v1.schema.json'), 'utf8'));
const text = readFileSync(script, 'utf8');
const pwsh = process.env.EX360_PWSH || 'pwsh';
const hasPwsh = spawnSync(pwsh, ['-NoProfile', '-Command', '1'], { encoding: 'utf8' }).status === 0;

const ps = s => s.replace(/'/g, "''");
// pwsh colours and wraps error text to the terminal width, so compare plain words only.
const plain = s => s.replace(/\x1B\[[0-9;]*m/g, '').replace(/\s*\|\s*/g, ' ').replace(/\s+/g, ' ');
function run(extra = '', env = {}, file = script) {
  const dir = mkdtempSync(path.join(tmpdir(), 'mailflow-'));
  const out = path.join(dir, 'export.json');
  const res = spawnSync(pwsh, ['-NoProfile', '-NonInteractive', '-Command', `. '${ps(stubs)}'; & '${ps(file)}' -UseExistingConnection -OutputPath '${ps(out)}' ${extra}`], { encoding: 'utf8', env: { ...process.env, ...env } });
  const json = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : null;
  rmSync(dir, { recursive: true, force: true });
  return { res, json };
}

test('the export never calls a cmdlet that changes the tenant', () => {
  const code = text.replace(/<#[\s\S]*?#>/g, '').replace(/^\s*#.*$/gm, '');
  assert.doesNotMatch(code, /\b(Set|New|Remove|Enable|Disable|Update|Add|Release|Restore|Start|Stop|Clear|Rotate|Send|Submit|Approve|Deny|Resume|Suspend|Move|Copy|Rename)-[A-Z][A-Za-z]+/);
  assert.match(text, /function Assert-ReadOnly/);
  assert.match(text, /^Assert-ReadOnly$/m, 'the guard runs before anything connects');
});

test('the export covers everything that affects mail flow in either direction', () => {
  const needed = {
    acceptedDomains: 'Get-AcceptedDomain', inboundConnectors: 'Get-InboundConnector', outboundConnectors: 'Get-OutboundConnector',
    transportRules: 'Get-TransportRule', remoteDomains: 'Get-RemoteDomain', journalRules: 'Get-JournalRule',
    dlpPolicies: 'Get-DlpCompliancePolicy', dlpRules: 'Get-DlpComplianceRule', sensitivityLabels: 'Get-Label', labelPolicies: 'Get-LabelPolicy',
    retentionPolicies: 'Get-RetentionCompliancePolicy', caseHoldPolicies: 'Get-ComplianceCase | ForEach-Object { Get-CaseHoldPolicy -Case', mailbox: 'Get-Mailbox', inboxRules: 'Get-InboxRule',
    mailboxPermissions: 'Get-MailboxPermission', recipientPermissions: 'Get-RecipientPermission', antiSpamPolicies: 'Get-HostedContentFilterPolicy',
    connectionFilterPolicies: 'Get-HostedConnectionFilterPolicy', antiMalwarePolicies: 'Get-MalwareFilterPolicy', antiPhishPolicies: 'Get-AntiPhishPolicy',
    outboundSpamPolicies: 'Get-HostedOutboundSpamFilterPolicy', safeLinksPolicies: 'Get-SafeLinksPolicy', safeAttachmentPolicies: 'Get-SafeAttachmentPolicy',
    presetEopRules: 'Get-EOPProtectionPolicyRule', presetAtpRules: 'Get-ATPProtectionPolicyRule', tenantAllowBlockSenders: 'Get-TenantAllowBlockListItems -ListType Sender',
    tenantAllowBlockIPs: 'Get-TenantAllowBlockListItems -ListType IP', dkimSigningConfig: 'Get-DkimSigningConfig', transportConfig: 'Get-TransportConfig',
    omeConfiguration: 'Get-OMEConfiguration', irmConfiguration: 'Get-IRMConfiguration',
    mailboxUser: 'Get-User -Identity <mailbox>', dlpSensitiveInformationTypes: 'Get-DlpSensitiveInformationType | Select-Object Name, Id, Publisher, Type',
  };
  for (const [name, cmd] of Object.entries(needed)) {
    assert.match(text, new RegExp(`name = '${name}';[^\\n]*command = '${cmd.replace(/[-|.*+?()[\]{}^$]/g, '\\$&')}`), `${name} runs ${cmd}`);
  }
});

test('the schema lists every status the script can write', () => {
  const statuses = schema.$defs.section.properties.status.enum;
  assert.deepEqual([...statuses].sort(), ['empty', 'error', 'ok', 'skipped', 'unavailable']);
  assert.equal(schema.properties.format.const, 'sectechtalk.mailflow-config');
  assert.equal(schema.properties.version.const, 1);
});

test('end to end: every section has a status, and failures carry the exact error', { skip: !hasPwsh && 'pwsh is not installed' }, () => {
  const { res, json } = run();
  assert.equal(res.status, 1, 'exit code 1 when any section was not read');
  assert.ok(json, res.stderr);
  for (const key of schema.required) assert.ok(key in json, `top-level ${key}`);
  assert.equal(json.format, 'sectechtalk.mailflow-config');
  assert.equal(json.readOnly, true);
  assert.equal(json.tenant.defaultDomain, 'contoso.com');
  assert.equal(json.mailbox.address, 'alex@contoso.com');
  const s = json.sections;
  const counted = { ok: 0, empty: 0, error: 0, unavailable: 0, skipped: 0 };
  for (const [name, sec] of Object.entries(s)) {
    for (const key of schema.$defs.section.required) assert.ok(key in sec, `${name}.${key}`);
    counted[sec.status]++;
    assert.equal(sec.count, sec.items.length, name);
    if (sec.status === 'ok' || sec.status === 'empty') assert.equal(sec.error, null, name);
    else assert.ok(sec.error && sec.error.message, `${name} has an error message`);
    assert.doesNotMatch(sec.command, /<mailbox>/, `${name} command names the mailbox`);
  }
  assert.deepEqual({ ...counted, sections: Object.keys(s).length }, { ...json.summary });

  assert.equal(s.journalRules.status, 'error');
  assert.match(s.journalRules.error.message, /doesn't have the Journaling role/);
  assert.equal(s.phishSimOverrideRules.status, 'unavailable');
  assert.match(s.phishSimOverrideRules.error.message, /Get-ExoPhishSimOverrideRule/);
  assert.equal(s.tenantAllowBlockUrls.status, 'empty');
  assert.equal(s.tenantAllowBlockIPs.items[0].Value, '198.51.100.7');

  const rule = s.transportRules.items[0];
  assert.deepEqual(rule.SubjectOrBodyContainsWords, ['confidential', 'project falcon']);
  assert.deepEqual(rule.SenderIpRanges, ['203.0.113.0/24']);
  assert.deepEqual(rule.Odd, { 1: 'non-string key' });
  assert.deepEqual(s.transportRules.warnings, ['Rule "Old disclaimer" uses a deprecated condition.']);

  const box = s.mailbox.items[0];
  assert.equal(box.ForwardingSmtpAddress, 'smtp:alex.home@fabrikam.example');
  assert.equal(box.PrimarySmtpAddress, 'alex@contoso.com');
  assert.equal(s.mailboxMemberOf.items[0].PrimarySmtpAddress, 'finance@contoso.com');
  assert.equal(s.dlpRules.items[0].ContentContainsSensitiveInformation[0].name, 'Credit Card Number');
  // Get-CaseHoldPolicy needs -Case; holds are read per eDiscovery case (live run 2026-11-21 failed without it).
  assert.equal(s.caseHoldPolicies.status, 'ok', JSON.stringify(s.caseHoldPolicies.error));
  assert.equal(s.caseHoldPolicies.items[0].CaseId, 'Get-ComplianceCase');
  assert.equal(s.caseHoldRules.status, 'ok', JSON.stringify(s.caseHoldRules.error));
});

test('end to end: secrets and binary data never reach the file', { skip: !hasPwsh && 'pwsh is not installed' }, () => {
  const { json } = run();
  const irm = json.sections.irmConfiguration.items[0];
  assert.equal(irm.ClientSecret, '(removed: may hold a secret)');
  assert.equal(irm.ServicePassword, '(removed: may hold a secret)');
  assert.equal(irm.AzureRMSLicensingEnabled, true, 'booleans are kept');
  assert.ok(json.secretsRemoved.includes('sections.irmConfiguration.items[0].ClientSecret'));
  assert.equal(json.sections.omeConfiguration.items[0].Image, '(binary, 64 bytes; not exported)');
  assert.doesNotMatch(JSON.stringify(json), /stubval1|TokenStatus/);
});

test('end to end: a token-shaped value stops the export and writes nothing', { skip: !hasPwsh && 'pwsh is not installed' }, () => {
  const { res, json } = run('', { MF_STUB_JWT: '1' });
  assert.notEqual(res.status, 0);
  assert.equal(json, null);
  assert.match(plain(res.stderr + res.stdout), /Refusing to write the file/);
});

test('end to end: -SkipCompliance records every Purview section as skipped with the reason', { skip: !hasPwsh && 'pwsh is not installed' }, () => {
  const { json } = run('-SkipCompliance');
  const purview = Object.values(json.sections).filter(x => x.session === 'ipps');
  assert.ok(purview.length >= 10);
  for (const sec of purview) {
    assert.equal(sec.status, 'skipped');
    assert.match(sec.error.message, /-SkipCompliance/);
  }
  assert.equal(json.connections.compliance.status, 'skipped');
});

test('end to end: the read-only guard refuses a section that would change the tenant', { skip: !hasPwsh && 'pwsh is not installed' }, () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'mailflow-guard-'));
  const bad = path.join(dir, 'bad.ps1');
  writeFileSync(bad, text.replace("$Sections = @(\n", "$Sections = @(\n    @{ name = 'evil'; conn = 'exo'; group = 'routing'; direction = 'both'; title = 'x'; command = 'x'; read = { Set-Mailbox -Identity $mb -ForwardingSmtpAddress x@y.example } }\n"));
  const res = spawnSync(pwsh, ['-NoProfile', '-NonInteractive', '-File', bad, '-ListSections'], { encoding: 'utf8' });
  rmSync(dir, { recursive: true, force: true });
  assert.notEqual(res.status, 0);
  const out = plain(res.stderr + res.stdout);
  assert.match(out, /Refusing to run\. These section commands are not read-only Get- cmdlets/);
  assert.match(out, /evil: Set-Mailbox/);
});
