// Organization settings as Exchange Online PowerShell returns them, keyed by the read's name.
// The live org read and the Contoso demo go through the same function, so pages and Config review
// see the same shape either way.
import { notAuthorized } from './permissions.js';
import { demoReportInput } from './demo-report.js';

export const ORG_READS = [
  'org', 'transport', 'externalTag', 'auditConfig', 'accepted', 'remote', 'dkim', 'arc', 'inbound', 'outbound', 'rules',
  'presetEop', 'presetAtp', 'builtIn', 'connectionPolicy', 'spamRule', 'spamPolicy', 'malwareRule', 'malwarePolicy',
  'phishRule', 'phishPolicy', 'safeLinksRule', 'safeLinksPolicy', 'safeAttachRule', 'safeAttachPolicy', 'atpGlobal',
  'outboundRule', 'outboundPolicy', 'allowSenders', 'quarantine', 'auth', 'retention', 'retentionTags', 'owa', 'mobile', 'sharing',
];

const DEFENDER_READS = new Set(['presetAtp', 'builtIn', 'safeLinksRule', 'safeLinksPolicy', 'safeAttachRule', 'safeAttachPolicy', 'atpGlobal']);

export function readError(name, error) {
  const text = String(error || '');
  if (/not authorized|Access Denied|Forbidden|does not have permission|isn't allowed|is not allowed/i.test(text)) return notAuthorized('exchange', text.slice(0, 200));
  if (/is not recognized|not recognized as|Cmdlet not found|not licensed|isn't available|is not available/i.test(text)) {
    return {
      ok: false, authorized: true, licensed: false, label: 'License required',
      message: DEFENDER_READS.has(name)
        ? `${name} is not available in this tenant. Safe Links, Safe Attachments and preset Defender policies need Microsoft Defender for Office 365.`
        : `${name} is not available in this tenant. ${text.slice(0, 160)}`,
    };
  }
  return { ok: false, authorized: true, label: 'Could not read', message: text.slice(0, 240) || `${name} did not return data.` };
}

// bundle: { ok, commands: [{ name, ok, value, error }] } from Invoke-Ex360Command.ps1, or a refusal.
export function settingsFrom(bundle, names = ORG_READS) {
  const settings = {};
  const errors = {};
  if (!bundle || bundle.ok === false) {
    const why = bundle && bundle.label ? bundle : notAuthorized('exchange', bundle?.message || '');
    for (const name of names) errors[name] = why;
    return { settings, errors, denied: why };
  }
  for (const name of names) {
    const row = (bundle.commands || []).find(c => c.name === name);
    if (!row) continue;
    if (row.ok === false) { errors[name] = readError(name, row.error); continue; }
    settings[name] = Array.isArray(row.value) ? row.value.filter(v => v != null) : [row.value].filter(v => v != null);
  }
  return { settings, errors, denied: null };
}

// Demo: the same Contoso organization rows the Everything for one user report uses, plus the reads
// that only the organization pages need.
export function demoOrgBundle() {
  const exo = demoReportInput('megan.bowen@contoso.com').exo;
  const keep = exo.commands.filter(c => ORG_READS.includes(c.name));
  const ok = (name, value) => ({ ok: true, name, value });
  const extra = [
    ok('auditConfig', [{ UnifiedAuditLogIngestionEnabled: true, AdminAuditLogEnabled: true }]),
    ok('arc', [{ ArcTrustedSealers: [] }]),
    ok('connectionPolicy', [{ Name: 'Default', IsDefault: true, EnableSafeList: false, IPAllowList: ['198.51.100.25'], IPBlockList: [] }]),
    ok('atpGlobal', [{ EnableATPForSPOTeamsODB: true, EnableSafeDocs: false, AllowSafeDocsOpen: false }]),
    ok('allowSenders', [{ Value: 'newsletter.example', Action: 'Allow', ExpirationDate: null, Notes: 'Marketing asked' }]),
    ok('sharing', [{ Name: 'Default Sharing Policy', Default: true, Enabled: true, Domains: ['Anonymous:CalendarSharingFreeBusyReviewer', '*:CalendarSharingFreeBusySimple'] }]),
    ok('quarantine', [{ Name: 'DefaultFullAccessPolicy', QuarantinePolicyType: 'QuarantinePolicy', EndUserQuarantinePermissionsValue: 23, ESNEnabled: false }, { Name: 'AdminOnlyAccessPolicy', QuarantinePolicyType: 'QuarantinePolicy', EndUserQuarantinePermissionsValue: 0, ESNEnabled: false }]),
  ];
  const dkim = keep.find(c => c.name === 'dkim');
  if (dkim) dkim.value = [{ Domain: 'contoso.com', Enabled: true, Status: 'Valid', Selector1CNAME: 'selector1-contoso-com._domainkey.contoso.onmicrosoft.com', Selector2CNAME: 'selector2-contoso-com._domainkey.contoso.onmicrosoft.com' }, { Domain: 'fabrikam.example', Enabled: false, Status: 'CnameMissing' }];
  const rules = keep.find(c => c.name === 'rules');
  if (rules) rules.value = [...rules.value, { Name: 'Bypass spam filter for partner', Priority: 4, State: 'Enabled', Mode: 'Enforce', SenderDomainIs: ['partner.example'], SetSCL: -1, Description: "If the message:\n\tIncludes these words in the sender's address domain portion: 'partner.example'\nTake the following actions:\n\tSet the spam confidence level (SCL) to '-1'", StopRuleProcessing: false }];
  // The extra columns the Exchange admin center's rules list shows, so the demo looks like the portal.
  const portalCols = {
    'Flag external spoof': { Size: 434, LastExecution: '2026-10-17T09:12:00Z', ConfigurationSupported: true, SenderAddressLocation: 'Header', RuleErrorAction: 'Ignore', WhenChanged: '2026-09-02T14:20:00Z' },
    'Disclaimer on Sales': { Size: 355, LastExecution: '2026-11-18T16:40:00Z', ConfigurationSupported: true, SenderAddressLocation: 'Header', RuleErrorAction: 'Ignore', WhenChanged: '2026-10-11T10:05:00Z' },
    'Disabled test rule': { Size: 298, LastExecution: null, ConfigurationSupported: true, SenderAddressLocation: 'Header', RuleErrorAction: 'Ignore', WhenChanged: '2026-08-30T08:00:00Z' },
    'Executive copy to legal': { Size: 512, LastExecution: '2026-11-19T07:55:00Z', ConfigurationSupported: false, UnsupportedReason: 'The rule uses a condition that the new Exchange admin center cannot show.', SenderAddressLocation: 'HeaderOrEnvelope', RuleErrorAction: 'Defer', SetAuditSeverity: 'Medium', WhenChanged: '2026-11-16T13:00:00Z' },
    'Bypass spam filter for partner': { Size: 389, LastExecution: '2026-11-12T11:30:00Z', ConfigurationSupported: true, SenderAddressLocation: 'Header', RuleErrorAction: 'Ignore', Comments: 'Partner asked us to stop junking their invoices.', WhenChanged: '2026-07-21T15:45:00Z' },
  };
  if (rules) rules.value = rules.value.map(r => ({ ...r, ...(portalCols[r.Name] || {}) }));
  const inbound = keep.find(c => c.name === 'inbound');
  if (inbound) inbound.value = inbound.value.map(c => ({ ...c, RestrictDomainsToCertificate: false, RestrictDomainsToIPAddresses: false, SenderIPAddresses: [] }));
  return { ok: true, mode: 'org', commands: [...keep.map(c => ({ ...c, value: c.value.map(v => ({ ...v })) })), ...extra] };
}
