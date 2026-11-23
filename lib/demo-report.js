// Fictional Contoso reads, shaped exactly like the live cmdlet and Graph output, so the demo report runs
// through the same code as a real tenant. Nothing here is a real customer.
import { DEMO_MAILBOXES, demoMailbox } from './demo.js';

const SALES_GROUP = 'aaaaaaaa-0000-4000-8000-000000000010';
const ROLE = 'aaaaaaaa-0000-4000-8000-000000000020';
const E5 = 'aaaaaaaa-0000-4000-8000-0000000000e5';
const E3 = 'aaaaaaaa-0000-4000-8000-0000000000e3';

const okCmd = (name, value) => ({ ok: true, name, value: Array.isArray(value) ? value : [value] });
const recipientScope = (extra = {}) => ({ SentTo: [], SentToMemberOf: [], RecipientDomainIs: [], ExceptIfSentTo: [], ExceptIfSentToMemberOf: [], ExceptIfRecipientDomainIs: [], ...extra });

function licensesFor(box) {
  if (box.licenses.includes('Microsoft 365 E5')) return [{ skuId: E5, skuPartNumber: 'SPE_E5', servicePlans: [{ servicePlanName: 'EXCHANGE_S_ENTERPRISE', provisioningStatus: 'Success' }, { servicePlanName: 'THREAT_INTELLIGENCE', provisioningStatus: 'Success' }, { servicePlanName: 'PURVIEW_E5', provisioningStatus: 'Success' }] }];
  if (box.licenses.includes('Microsoft 365 E3')) return [{ skuId: E3, skuPartNumber: 'SPE_E3', servicePlans: [{ servicePlanName: 'EXCHANGE_S_ENTERPRISE', provisioningStatus: 'Success' }] }];
  return [];
}

export function demoReportInput(id) {
  const box = demoMailbox(id) || DEMO_MAILBOXES[0];
  const local = box.primary.split('@')[0];
  const inSales = box.memberOf.length > 0;
  const groups = [
    ...(inSales ? [{ '@odata.type': '#microsoft.graph.group', id: SALES_GROUP, displayName: 'Sales', mail: 'sales-team@contoso.com', mailEnabled: true, securityEnabled: false, groupTypes: [] }] : []),
    ...(box.displayName === 'Adele Vance' ? [{ '@odata.type': '#microsoft.graph.directoryRole', id: ROLE, displayName: 'Exchange Administrator', roleTemplateId: '29232cdf-9323-42fd-ade2-1d097af3e4de' }] : []),
  ];
  const user = {
    id: box.id, displayName: box.displayName, userPrincipalName: box.primary, mail: box.primary, mailNickname: local,
    accountEnabled: !/Room|Shared/.test(box.type) || false, userType: 'Member', jobTitle: box.type === 'UserMailbox' ? 'Sales lead' : null,
    department: box.type === 'UserMailbox' ? 'Sales' : null, usageLocation: 'US', createdDateTime: '2025-02-03T16:00:00Z', onPremisesSyncEnabled: false,
    proxyAddresses: [`SMTP:${box.primary}`, ...box.aliases.filter(a => a !== box.primary).map(a => `smtp:${a}`)],
    licenseAssignmentStates: licensesFor(box).map(l => ({ skuId: l.skuId, assignedByGroup: null })),
  };
  const mailbox = {
    Name: local, Alias: local, DisplayName: box.displayName, PrimarySmtpAddress: box.primary, UserPrincipalName: box.primary,
    ExternalDirectoryObjectId: box.id, RecipientTypeDetails: box.type, EmailAddresses: user.proxyAddresses, HiddenFromAddressListsEnabled: false,
    ForwardingSmtpAddress: box.forwarding.smtp ? `smtp:${box.forwarding.smtp}` : null, DeliverToMailboxAndForward: box.forwarding.deliverAndForward,
    GrantSendOnBehalfTo: box.sendOnBehalf.map(s => s.name), LitigationHoldEnabled: box.litigationHold, LitigationHoldDate: box.litigationHold ? '2026-06-01T00:00:00Z' : null,
    LitigationHoldDuration: 'Unlimited', InPlaceHolds: box.displayName === 'Megan Bowen' ? ['UniH9f3c1b2a-0000-4000-8000-00000000c001'] : [],
    ComplianceTagHoldApplied: false, DelayHoldApplied: false, RetentionHoldEnabled: box.retentionHold, RetentionPolicy: box.retentionPolicy,
    SingleItemRecoveryEnabled: true, RetainDeletedItemsFor: '14.00:00:00', ArchiveStatus: box.type === 'UserMailbox' ? 'Active' : 'None', AutoExpandingArchiveEnabled: false,
    IssueWarningQuota: '98 GB (105,226,698,752 bytes)', ProhibitSendQuota: '99 GB (106,300,440,576 bytes)', ProhibitSendReceiveQuota: `${box.quota} (107,374,182,400 bytes)`,
    MaxSendSize: '35 MB (36,700,160 bytes)', MaxReceiveSize: '36 MB (37,748,736 bytes)', RecipientLimits: 500, AuditEnabled: true,
    MessageCopyForSentAsEnabled: box.type === 'SharedMailbox', MessageCopyForSendOnBehalfEnabled: false, AcceptMessagesOnlyFrom: [], AcceptMessagesOnlyFromDLMembers: [],
    RejectMessagesFrom: [], RejectMessagesFromDLMembers: [], RequireSenderAuthenticationEnabled: false, SharingPolicy: 'Default Sharing Policy', RoleAssignmentPolicy: 'Default Role Assignment Policy',
    WhenMailboxCreated: '2025-02-03T16:05:00Z',
  };
  const exo = {
    ok: true, mode: 'report', commands: [
      okCmd('mailbox', mailbox),
      okCmd('userAuth', { AuthenticationPolicy: box.authPolicy === 'Default' ? null : box.authPolicy }),
      okCmd('stats', { TotalItemSize: `${box.size} (1 bytes)`, TotalDeletedItemSize: '120 MB (125,829,120 bytes)', ItemCount: 18234, LastLogonTime: '2026-11-17T08:10:00Z' }),
      box.type === 'UserMailbox' ? okCmd('archiveStats', { TotalItemSize: '2.1 GB (2,254,857,830 bytes)', ItemCount: 9100 }) : { ok: false, name: 'archiveStats', error: "The archive mailbox couldn't be found." },
      okCmd('cas', { OWAEnabled: true, MAPIEnabled: box.cas.mapi, EwsEnabled: box.cas.ews, ActiveSyncEnabled: box.cas.activeSync, PopEnabled: box.cas.pop, ImapEnabled: box.cas.imap, SmtpClientAuthenticationDisabled: box.cas.smtp ? false : null, OwaMailboxPolicy: 'OwaMailboxPolicy-Default', ActiveSyncMailboxPolicy: 'Default', OutlookMobileEnabled: true }),
      okCmd('inbox', box.inboxRules.map((r, i) => ({ Name: r.name, Enabled: r.enabled, Priority: i + 1, Description: r.description }))),
      okCmd('full', box.fullAccess.map(f => ({ User: f.address, AccessRights: ['FullAccess'], Deny: false }))),
      okCmd('sendas', box.sendAs.map(f => ({ Trustee: f.address, AccessRights: ['SendAs'] }))),
      okCmd('autoReply', box.displayName === 'Adele Vance' ? { AutoReplyState: 'Scheduled', StartTime: '2026-11-20T17:00:00Z', EndTime: '2026-11-30T17:00:00Z', ExternalAudience: 'Known', InternalMessage: '<p>Out until Dec 1. Ask Megan for anything urgent.</p>', ExternalMessage: '<p>I am out until Dec 1.</p>' } : { AutoReplyState: 'Disabled' }),
      okCmd('junk', { Enabled: true, ContactsTrusted: true, TrustedListsOnly: false, TrustedCount: 4, BlockedCount: 1 }),
      okCmd('devices', box.type === 'UserMailbox' ? [{ FriendlyName: `${box.displayName.split(' ')[0]}'s iPhone`, DeviceModel: 'iPhone', DeviceOS: 'iOS 19.1', ClientType: 'Outlook', DeviceAccessState: 'Allowed', FirstSyncTime: '2026-03-02T15:00:00Z' }] : []),
      okCmd('org', { Name: 'contoso.onmicrosoft.com', OAuth2ClientProfileEnabled: true, DefaultAuthenticationPolicy: 'Block basic auth', AuditDisabled: false, InPlaceHolds: ['mbx5c1a2b3c000040008000000000000a01:1'] }),
      okCmd('transport', { SmtpClientAuthenticationDisabled: true }),
      okCmd('externalTag', { Enabled: true, AllowList: [] }),
      okCmd('accepted', [{ DomainName: 'contoso.com', DomainType: 'Authoritative', Default: true }, { DomainName: 'fabrikam.example', DomainType: 'InternalRelay', Default: false }]),
      okCmd('remote', [{ Name: 'Default', DomainName: '*', AutoForwardEnabled: false, AutoReplyEnabled: true, AllowedOOFType: 'External' }, { Name: 'Northwind', DomainName: 'northwind.example', AutoForwardEnabled: true }]),
      okCmd('dkim', [{ Domain: 'contoso.com', Enabled: true, Status: 'Valid' }]),
      okCmd('inbound', [{ Name: 'From Northwind gateway', Enabled: true, ConnectorType: 'Partner', SenderDomains: ['smtp:northwind.example;1'], RequireTls: true }]),
      okCmd('outbound', [{ Name: 'To the journaling service', Enabled: true, ConnectorType: 'Partner', RecipientDomains: ['journal.example'], SmartHosts: ['smtp.journal.example'], TlsSettings: 'DomainValidation', IsTransportRuleScoped: false }]),
      okCmd('rules', [
        { Name: 'Flag external spoof', Priority: 0, State: 'Enabled', Mode: 'Enforce', FromScope: 'NotInOrganization', Description: "If the message:\n\tIs received from 'Outside the organization'\nTake the following actions:\n\tPrepend the subject of the message with '[External] '", StopRuleProcessing: false },
        { Name: 'Disclaimer on Sales', Priority: 1, State: 'Enabled', Mode: 'Enforce', FromMemberOf: ['sales-team@contoso.com'], Description: "If the message:\n\tIs sent from a member of group 'sales-team@contoso.com'\nTake the following actions:\n\tAppend the disclaimer 'Contoso Sales. Confidential.'", StopRuleProcessing: false },
        { Name: 'Disabled test rule', Priority: 2, State: 'Disabled', Mode: 'Enforce', SentTo: ['megan.bowen@contoso.com'], Description: "If the message:\n\tIs sent to 'megan.bowen@contoso.com'\nTake the following actions:\n\tReject the message with the explanation 'Test'", StopRuleProcessing: true },
        { Name: 'Executive copy to legal', Priority: 3, State: 'Enabled', Mode: 'AuditAndNotify', SentTo: ['adele.vance@contoso.com'], Description: "If the message:\n\tIs sent to 'adele.vance@contoso.com'\nTake the following actions:\n\tBlind carbon copy (Bcc) the message to 'legal@contoso.com'", StopRuleProcessing: false },
      ]),
      okCmd('presetEop', [
        { Name: 'Standard Preset Security Policy', Identity: 'Standard Preset Security Policy', Priority: 1, State: 'Enabled', ...recipientScope({ SentToMemberOf: ['sales-team@contoso.com'] }), HostedContentFilterPolicy: 'Standard Preset Security Policy1700000000001', MalwareFilterPolicy: 'Standard Preset Security Policy1700000000002', AntiPhishPolicy: 'Standard Preset Security Policy1700000000003' },
        { Name: 'Strict Preset Security Policy', Identity: 'Strict Preset Security Policy', Priority: 0, State: 'Enabled', ...recipientScope({ SentTo: ['adele.vance@contoso.com'] }), HostedContentFilterPolicy: 'Strict Preset Security Policy1700000000011', MalwareFilterPolicy: 'Strict Preset Security Policy1700000000012', AntiPhishPolicy: 'Strict Preset Security Policy1700000000013' },
      ]),
      okCmd('presetAtp', [
        { Name: 'Standard Preset Security Policy', Identity: 'Standard Preset Security Policy', Priority: 1, State: 'Disabled', ...recipientScope({ SentToMemberOf: ['sales-team@contoso.com'] }), SafeLinksPolicy: 'Standard Preset Security Policy1700000000004', SafeAttachmentPolicy: 'Standard Preset Security Policy1700000000005', AntiPhishPolicy: 'Standard Preset Security Policy1700000000003' },
      ]),
      okCmd('builtIn', [{ Name: 'ATP Built-In Protection Rule', Identity: 'ATP Built-In Protection Rule', Priority: 0, State: 'Enabled', ...recipientScope(), SafeLinksPolicy: 'Built-In Protection Policy', SafeAttachmentPolicy: 'Built-In Protection Policy' }]),
      okCmd('spamRule', [{ Name: 'Executives', Priority: 0, State: 'Enabled', ...recipientScope({ SentTo: ['adele.vance@contoso.com'] }), HostedContentFilterPolicy: 'Executives' }]),
      okCmd('spamPolicy', [
        { Name: 'Default', IsDefault: true, SpamAction: 'MoveToJmf', HighConfidenceSpamAction: 'MoveToJmf', PhishSpamAction: 'Quarantine', HighConfidencePhishAction: 'Quarantine', BulkSpamAction: 'MoveToJmf', BulkThreshold: 7, QuarantineRetentionPeriod: 15, PhishQuarantineTag: 'AdminOnlyAccessPolicy', SpamZapEnabled: true, PhishZapEnabled: true, AllowedSenderCount: 2, BlockedSenderCount: 0 },
        { Name: 'Executives', IsDefault: false, SpamAction: 'Quarantine', HighConfidenceSpamAction: 'Quarantine', PhishSpamAction: 'Quarantine', HighConfidencePhishAction: 'Quarantine', BulkSpamAction: 'Quarantine', BulkThreshold: 5, QuarantineRetentionPeriod: 30, SpamZapEnabled: true, PhishZapEnabled: true },
        { Name: 'Standard Preset Security Policy1700000000001', RecommendedPolicyType: 'Standard', SpamAction: 'MoveToJmf', HighConfidenceSpamAction: 'Quarantine', PhishSpamAction: 'Quarantine', HighConfidencePhishAction: 'Quarantine', BulkSpamAction: 'MoveToJmf', BulkThreshold: 6, QuarantineRetentionPeriod: 30, SpamQuarantineTag: 'DefaultFullAccessPolicy', HighConfidencePhishQuarantineTag: 'AdminOnlyAccessPolicy', SpamZapEnabled: true, PhishZapEnabled: true },
      ]),
      okCmd('malwareRule', []),
      okCmd('malwarePolicy', [{ Name: 'Default', IsDefault: true, EnableFileFilter: true, FileTypeAction: 'Reject', ZapEnabled: true, QuarantineTag: 'AdminOnlyAccessPolicy', FileTypeCount: 53 }, { Name: 'Standard Preset Security Policy1700000000002', RecommendedPolicyType: 'Standard', EnableFileFilter: true, FileTypeAction: 'Reject', ZapEnabled: true, QuarantineTag: 'AdminOnlyAccessPolicy', FileTypeCount: 53 }]),
      okCmd('phishRule', [{ Name: 'Protect Contoso', Priority: 0, State: 'Enabled', ...recipientScope({ RecipientDomainIs: ['contoso.com'] }), AntiPhishPolicy: 'Contoso anti-phish' }]),
      okCmd('phishPolicy', [{ Name: 'Office365 AntiPhish Default', IsDefault: true, Enabled: true, EnableSpoofIntelligence: true, AuthenticationFailAction: 'MoveToJmf', HonorDmarcPolicy: true }, { Name: 'Contoso anti-phish', Enabled: true, PhishThresholdLevel: 2, EnableSpoofIntelligence: true, AuthenticationFailAction: 'Quarantine', HonorDmarcPolicy: true, EnableFirstContactSafetyTips: true, EnableUnauthenticatedSender: true, EnableViaTag: true, EnableMailboxIntelligence: true, EnableMailboxIntelligenceProtection: true, EnableTargetedUserProtection: true, EnableOrganizationDomainsProtection: true, EnableTargetedDomainsProtection: false }, { Name: 'Standard Preset Security Policy1700000000003', RecommendedPolicyType: 'Standard', Enabled: true, PhishThresholdLevel: 3, EnableSpoofIntelligence: true, AuthenticationFailAction: 'Quarantine', HonorDmarcPolicy: true }]),
      okCmd('safeLinksRule', [{ Name: 'Sales Safe Links', Priority: 0, State: 'Enabled', ...recipientScope({ SentToMemberOf: ['sales-team@contoso.com'] }), SafeLinksPolicy: 'Safe Links standard' }]),
      okCmd('safeLinksPolicy', [{ Name: 'Built-In Protection Policy', IsBuiltInProtection: true, EnableSafeLinksForEmail: true, EnableSafeLinksForTeams: true, EnableSafeLinksForOffice: true, ScanUrls: true, DeliverMessageAfterScan: true, EnableForInternalSenders: false, TrackClicks: true, AllowClickThrough: false, DisableUrlRewrite: true }, { Name: 'Safe Links standard', EnableSafeLinksForEmail: true, EnableSafeLinksForTeams: true, EnableSafeLinksForOffice: true, ScanUrls: true, DeliverMessageAfterScan: true, EnableForInternalSenders: true, TrackClicks: true, AllowClickThrough: false, DisableUrlRewrite: false }]),
      okCmd('safeAttachRule', [{ Name: 'All mailboxes', Priority: 0, State: 'Enabled', ...recipientScope({ RecipientDomainIs: ['contoso.com'] }), SafeAttachmentPolicy: 'Safe Attachments dynamic' }]),
      okCmd('safeAttachPolicy', [{ Name: 'Built-In Protection Policy', IsBuiltInProtection: true, Enable: true, Action: 'Block', QuarantineTag: 'AdminOnlyAccessPolicy' }, { Name: 'Safe Attachments dynamic', Enable: true, Action: 'DynamicDelivery', Redirect: false, QuarantineTag: 'AdminOnlyAccessPolicy' }]),
      okCmd('outboundRule', []),
      okCmd('outboundPolicy', [{ Name: 'Default', IsDefault: true, AutoForwardingMode: 'Automatic', RecipientLimitExternalPerHour: 0, RecipientLimitInternalPerHour: 0, RecipientLimitPerDay: 0, ActionWhenThresholdReached: 'BlockUserForToday' }]),
      okCmd('retention', [{ Name: 'Default MRM Policy', IsDefault: true, RetentionPolicyTagLinks: ['Default 2 year move to archive', 'Deleted Items', 'Junk Email', '1 Month Delete'] }]),
      okCmd('retentionTags', [
        { Name: 'Default 2 year move to archive', Type: 'All', RetentionEnabled: true, AgeLimitForRetention: '730.00:00:00', RetentionAction: 'MoveToArchive' },
        { Name: 'Deleted Items', Type: 'DeletedItems', RetentionEnabled: true, AgeLimitForRetention: '30.00:00:00', RetentionAction: 'MoveToDeletedItems' },
        { Name: 'Junk Email', Type: 'JunkEmail', RetentionEnabled: true, AgeLimitForRetention: '30.00:00:00', RetentionAction: 'DeleteAndAllowRecovery' },
        { Name: '1 Month Delete', Type: 'Personal', RetentionEnabled: true, AgeLimitForRetention: '30.00:00:00', RetentionAction: 'DeleteAndAllowRecovery' },
      ]),
      okCmd('owa', [{ Name: 'OwaMailboxPolicy-Default', IsDefault: true }]),
      okCmd('mobile', [{ Name: 'Default', IsDefault: true }]),
      okCmd('auth', [{ Name: 'Block basic auth', AllowBasicAuthSmtp: false, AllowBasicAuthPop: false, AllowBasicAuthImap: false }]),
      okCmd('traceIn', (box.trace || []).map(t => ({ Received: t.time, SenderAddress: t.sender, RecipientAddress: t.recipient, Subject: t.subject, Status: t.status }))),
      okCmd('traceOut', box.type === 'UserMailbox' ? [{ Received: '2026-11-17T10:02:00Z', SenderAddress: box.primary, RecipientAddress: 'buyer@fabrikam.example', Subject: 'Quote for Q1', Status: 'Delivered' }] : []),
    ],
  };
  const ipps = {
    ok: true, mode: 'govern', commands: [
      okCmd('dlp', [
        { Name: 'Credit card in email', Mode: 'TestWithNotifications', Enabled: true, Workload: 'Exchange, SharePoint', ExchangeLocation: ['All'], ExchangeLocationException: [], ExchangeSenderMemberOf: [], ExchangeSenderMemberOfException: [] },
        { Name: 'Sales confidential', Mode: 'Enable', Enabled: true, Workload: 'Exchange', ExchangeLocation: [], ExchangeLocationException: [], ExchangeSenderMemberOf: ['sales-team@contoso.com'], ExchangeSenderMemberOfException: [] },
      ]),
      okCmd('retention', [
        { Name: 'Mailbox 7 years', Guid: '5c1a2b3c-0000-4000-8000-000000000a01', Enabled: true, Mode: 'Enforce', ExchangeLocation: ['All'], ExchangeLocationException: [] },
        { Name: 'Executives longer', Guid: '5c1a2b3c-0000-4000-8000-000000000a02', Enabled: true, Mode: 'Enforce', ExchangeLocation: ['adele.vance@contoso.com'], ExchangeLocationException: [] },
      ]),
      okCmd('retentionRules', [{ Name: 'Mailbox 7 years rule', Policy: 'Mailbox 7 years', RetentionDuration: 2555, RetentionComplianceAction: 'Keep' }, { Name: 'Executives rule', Policy: 'Executives longer', RetentionDuration: 3650, RetentionComplianceAction: 'KeepAndDelete' }]),
      okCmd('labelPolicies', [{ Name: 'Publish default labels', Enabled: true, Labels: ['Public', 'Confidential'], ExchangeLocation: ['All'], ExchangeLocationException: [] }]),
      okCmd('holds', [{ Name: 'North custodians', Guid: '9f3c1b2a-0000-4000-8000-00000000c001', CaseId: 'case-north', Enabled: true, ExchangeLocation: ['megan.bowen@contoso.com'] }]),
      okCmd('cases', [{ Name: 'Project North', Identity: 'case-north', Status: 'Active', CaseType: 'eDiscovery' }]),
    ],
  };
  const ca = [
    { displayName: 'Require MFA for Exchange', state: 'enabled', conditions: { users: { includeUsers: ['All'], excludeUsers: [] }, applications: { includeApplications: ['00000002-0000-0ff1-ce00-000000000000'] }, clientAppTypes: ['all'] }, grantControls: { operator: 'OR', builtInControls: ['mfa'] } },
    { displayName: 'Block legacy auth', state: 'enabled', conditions: { users: { includeGroups: [SALES_GROUP] }, applications: { includeApplications: ['Office365'] }, clientAppTypes: ['exchangeActiveSync', 'other'] }, grantControls: { operator: 'OR', builtInControls: ['block'] } },
    { displayName: 'SharePoint unmanaged devices', state: 'enabledForReportingButNotEnforced', conditions: { users: { includeUsers: ['All'] }, applications: { includeApplications: ['00000003-0000-0ff1-ce00-000000000000'] } }, grantControls: { operator: 'OR', builtInControls: ['compliantDevice'] } },
  ];
  const signIns = (box.signIns || []).map(s => ({ createdDateTime: s.time, appDisplayName: s.app, clientAppUsed: 'Mobile Apps and Desktop clients', status: { errorCode: s.status === 'Success' ? 0 : 50126 }, ipAddress: s.ip, location: { city: 'Seattle', countryOrRegion: 'US' } }));
  const alerts = box.displayName === 'Megan Bowen' ? [{ title: 'Mail-forwarding rule created', severity: 'medium', status: 'new', createdDateTime: '2026-11-16T14:30:00Z' }] : [];
  return {
    source: 'demo',
    requested: box.primary,
    signedInAs: 'Demo mode (nobody signed in)',
    graph: {
      user: { ok: true, json: user },
      licenses: { ok: true, value: licensesFor(box) },
      groups: { ok: true, value: groups },
      signIns: { ok: true, value: signIns },
      ca: { ok: true, value: ca },
      alerts: { ok: true, value: alerts },
    },
    exo,
    ipps,
  };
}
