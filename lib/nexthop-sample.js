// The Contoso sample topology for NextHop: a fictional organization written in exactly the shape that
// export/Export-MailFlowConfig.ps1 produces (format "sectechtalk.mailflow-config", version 1), so NextHop reads it
// the same way it reads a real export. Nothing here came from, or goes to, a real tenant. contoso.com, fabrikam.com
// and the *.example domains are names Microsoft and the IETF reserve for examples; the IPs are documentation ranges
// (192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24).
//
// It is built to teach: each common mail flow and governance setting is here at least once, including a few
// classic mistakes (an allowed sender domain in anti-spam, a rule that skips spam filtering for a partner, an inbox
// rule that forwards to a personal address). lib/nexthop-scenarios.js has test messages that walk through them.

// Section metadata, copied from the export script's section list. tests/nexthop.test.mjs checks they still match.
export const SECTION_META = {
  organizationConfig: ["routing", "both", "exo", "Organization configuration", "Get-OrganizationConfig"],
  transportConfig: ["routing", "both", "exo", "Transport configuration (size limits, SMTP AUTH, journaling mailbox, reply-all storm)", "Get-TransportConfig"],
  acceptedDomains: ["routing", "both", "exo", "Accepted domains", "Get-AcceptedDomain"],
  remoteDomains: ["routing", "outbound", "exo", "Remote domains (auto-forward, auto-reply, NDR, TNEF to outside domains)", "Get-RemoteDomain"],
  inboundConnectors: ["routing", "inbound", "exo", "Inbound connectors", "Get-InboundConnector"],
  outboundConnectors: ["routing", "outbound", "exo", "Outbound connectors", "Get-OutboundConnector"],
  transportRules: ["routing", "both", "exo", "Mail flow rules (transport rules), every condition, exception and action", "Get-TransportRule -ResultSize Unlimited"],
  journalRules: ["routing", "both", "exo", "Journal rules", "Get-JournalRule"],
  externalInOutlook: ["routing", "inbound", "exo", "External sender tag in Outlook", "Get-ExternalInOutlook"],
  arcConfig: ["routing", "inbound", "exo", "Trusted ARC sealers", "Get-ArcConfig"],
  dkimSigningConfig: ["routing", "outbound", "exo", "DKIM signing per domain", "Get-DkimSigningConfig"],
  connectionFilterPolicies: ["protection", "inbound", "exo", "Connection filter (IP allow list, IP block list, safe list)", "Get-HostedConnectionFilterPolicy"],
  antiSpamPolicies: ["protection", "inbound", "exo", "Anti-spam (inbound) policies", "Get-HostedContentFilterPolicy"],
  antiSpamRules: ["protection", "inbound", "exo", "Anti-spam (inbound) rules: who each policy applies to", "Get-HostedContentFilterRule"],
  outboundSpamPolicies: ["protection", "outbound", "exo", "Outbound spam policies (sending limits, auto-forwarding)", "Get-HostedOutboundSpamFilterPolicy"],
  outboundSpamRules: ["protection", "outbound", "exo", "Outbound spam rules: which senders each policy applies to", "Get-HostedOutboundSpamFilterRule"],
  antiMalwarePolicies: ["protection", "both", "exo", "Anti-malware policies (common attachment filter)", "Get-MalwareFilterPolicy"],
  antiMalwareRules: ["protection", "both", "exo", "Anti-malware rules", "Get-MalwareFilterRule"],
  antiPhishPolicies: ["protection", "inbound", "exo", "Anti-phishing policies (spoof, impersonation, DMARC honoring)", "Get-AntiPhishPolicy"],
  antiPhishRules: ["protection", "inbound", "exo", "Anti-phishing rules", "Get-AntiPhishRule"],
  safeLinksPolicies: ["protection", "both", "exo", "Safe Links policies", "Get-SafeLinksPolicy"],
  safeLinksRules: ["protection", "both", "exo", "Safe Links rules", "Get-SafeLinksRule"],
  safeAttachmentPolicies: ["protection", "both", "exo", "Safe Attachments policies", "Get-SafeAttachmentPolicy"],
  safeAttachmentRules: ["protection", "both", "exo", "Safe Attachments rules", "Get-SafeAttachmentRule"],
  atpPolicyForO365: ["protection", "both", "exo", "Defender for Office 365 global settings", "Get-AtpPolicyForO365"],
  presetEopRules: ["protection", "both", "exo", "Preset security policies: Standard and Strict (EOP part)", "Get-EOPProtectionPolicyRule"],
  presetAtpRules: ["protection", "both", "exo", "Preset security policies: Standard and Strict (Defender part)", "Get-ATPProtectionPolicyRule"],
  builtInProtectionRule: ["protection", "both", "exo", "Built-in protection preset", "Get-ATPBuiltInProtectionRule"],
  tenantAllowBlockSenders: ["protection", "both", "exo", "Tenant Allow/Block List: senders and domains", "Get-TenantAllowBlockListItems -ListType Sender"],
  tenantAllowBlockUrls: ["protection", "both", "exo", "Tenant Allow/Block List: URLs", "Get-TenantAllowBlockListItems -ListType Url"],
  tenantAllowBlockFiles: ["protection", "both", "exo", "Tenant Allow/Block List: file hashes", "Get-TenantAllowBlockListItems -ListType FileHash"],
  tenantAllowBlockIPs: ["protection", "inbound", "exo", "Tenant Allow/Block List: IP addresses", "Get-TenantAllowBlockListItems -ListType IP"],
  tenantAllowBlockSpoof: ["protection", "inbound", "exo", "Tenant Allow/Block List: spoofed senders", "Get-TenantAllowBlockListSpoofItems"],
  quarantinePolicies: ["protection", "inbound", "exo", "Quarantine policies (what recipients may do with quarantined mail)", "Get-QuarantinePolicy"],
  secOpsOverridePolicy: ["protection", "inbound", "exo", "Advanced delivery: SecOps mailboxes (filtering bypass)", "Get-SecOpsOverridePolicy"],
  secOpsOverrideRules: ["protection", "inbound", "exo", "Advanced delivery: SecOps mailbox rules", "Get-ExoSecOpsOverrideRule"],
  phishSimOverridePolicy: ["protection", "inbound", "exo", "Advanced delivery: third-party phishing simulations (sending IPs and domains that bypass filtering)", "Get-PhishSimOverridePolicy"],
  phishSimOverrideRules: ["protection", "inbound", "exo", "Advanced delivery: phishing simulation rules", "Get-ExoPhishSimOverrideRule"],
  irmConfiguration: ["encryption", "both", "exo", "IRM configuration (Microsoft Purview Message Encryption)", "Get-IRMConfiguration"],
  omeConfiguration: ["encryption", "outbound", "exo", "OME branding templates", "Get-OMEConfiguration"],
  rmsTemplates: ["encryption", "outbound", "exo", "Rights protection templates that mail flow rules can apply", "Get-RMSTemplate"],
  mrmRetentionPolicies: ["retention", "both", "exo", "Exchange retention policies (MRM)", "Get-RetentionPolicy"],
  mrmRetentionTags: ["retention", "both", "exo", "Exchange retention tags (MRM)", "Get-RetentionPolicyTag"],
  mailbox: ["mailbox", "both", "exo", "Mailbox: forwarding, holds, quotas, delivery restrictions, send on behalf", "Get-Mailbox -Identity <mailbox>"],
  mailboxMemberOf: ["mailbox", "both", "exo", "Groups the mailbox is a direct member of (for rules scoped to a group)", "Get-Recipient -Filter \"Members -eq '<mailbox DN>'\" -ResultSize Unlimited"],
  mailboxUser: ["mailbox", "both", "exo", "The mailbox owner as a user: department, title, office, country and manager (mail flow rules can match these)", "Get-User -Identity <mailbox>"],
  casMailbox: ["mailbox", "outbound", "exo", "Mailbox client access (SMTP AUTH and protocols)", "Get-CASMailbox -Identity <mailbox>"],
  mailboxStatistics: ["mailbox", "inbound", "exo", "Mailbox size (a full mailbox rejects new mail)", "Get-MailboxStatistics -Identity <mailbox>"],
  inboxRules: ["mailbox", "both", "exo", "Inbox rules, including hidden ones", "Get-InboxRule -Mailbox <mailbox> -IncludeHidden"],
  mailboxPermissions: ["mailbox", "both", "exo", "Delegates: Full Access (not inherited)", "Get-MailboxPermission -Identity <mailbox> | Where-Object { -not $_.IsInherited }"],
  recipientPermissions: ["mailbox", "outbound", "exo", "Delegates: Send As", "Get-RecipientPermission -Identity <mailbox>"],
  calendarPermissions: ["mailbox", "inbound", "exo", "Delegates: calendar folder (meeting requests can be sent to delegates)", "Get-MailboxFolderStatistics -Identity <mailbox> -FolderScope Calendar, then Get-MailboxFolderPermission on the default calendar"],
  autoReply: ["mailbox", "outbound", "exo", "Automatic replies (out of office)", "Get-MailboxAutoReplyConfiguration -Identity <mailbox>"],
  junkEmailConfig: ["mailbox", "inbound", "exo", "Junk email settings (safe and blocked senders)", "Get-MailboxJunkEmailConfiguration -Identity <mailbox>"],
  dlpPolicies: ["compliance", "both", "ipps", "DLP policies", "Get-DlpCompliancePolicy"],
  dlpRules: ["compliance", "both", "ipps", "DLP rules: conditions, sensitive info types, actions", "Get-DlpComplianceRule"],
  dlpSensitiveInformationTypes: ["compliance", "both", "ipps", "Sensitive information types: names and IDs, so DLP and auto-labeling rules can be read by name", "Get-DlpSensitiveInformationType | Select-Object Name, Id, Publisher, Type"],
  sensitivityLabels: ["compliance", "both", "ipps", "Sensitivity labels", "Get-Label"],
  labelPolicies: ["compliance", "both", "ipps", "Sensitivity label policies", "Get-LabelPolicy"],
  autoLabelPolicies: ["compliance", "both", "ipps", "Auto-labeling policies", "Get-AutoSensitivityLabelPolicy"],
  autoLabelRules: ["compliance", "both", "ipps", "Auto-labeling rules", "Get-AutoSensitivityLabelRule"],
  retentionPolicies: ["compliance", "both", "ipps", "Purview retention policies", "Get-RetentionCompliancePolicy"],
  retentionRules: ["compliance", "both", "ipps", "Purview retention rules", "Get-RetentionComplianceRule"],
  retentionLabels: ["compliance", "both", "ipps", "Retention labels", "Get-ComplianceTag"],
  complianceCases: ["compliance", "both", "ipps", "eDiscovery cases (holds belong to cases)", "Get-ComplianceCase"],
  caseHoldPolicies: ["compliance", "both", "ipps", "eDiscovery hold policies, read for each case", "Get-ComplianceCase | ForEach-Object { Get-CaseHoldPolicy -Case $_.Identity }"],
  caseHoldRules: ["compliance", "both", "ipps", "eDiscovery hold rules (one per hold policy)", "Get-ComplianceCase | ForEach-Object { Get-CaseHoldPolicy -Case $_.Identity } | ForEach-Object { Get-CaseHoldRule -Policy $_.Guid }"],
};

export const SAMPLE_MAILBOX = 'megan.bowen@contoso.com';
const MB = SAMPLE_MAILBOX;
const MEGAN_DN = 'CN=megan.bowen,OU=contoso.onmicrosoft.com,OU=Microsoft Exchange Hosted Organizations,DC=NAMPR01A001,DC=PROD,DC=OUTLOOK,DC=COM';
const T = '2026-11-01T09:00:00.0000000Z';

const CCN = { name: 'Credit Card Number', id: '50842eb7-edc8-4019-85dd-5a5c1f2bb085', mincount: '1', maxcount: '-1', confidencelevel: 'High' };
const SSN = { name: 'U.S. Social Security Number (SSN)', id: 'a44669fe-0d48-453d-a9b1-2cc83f2cba77', mincount: '1', maxcount: '-1', confidencelevel: 'High' };
const LABEL = {
  public: 'aaaaaaaa-0000-4000-8000-0000000000e1', general: 'aaaaaaaa-0000-4000-8000-0000000000e2',
  confidential: 'aaaaaaaa-0000-4000-8000-0000000000e3', highly: 'aaaaaaaa-0000-4000-8000-0000000000e4',
};
const DEFAULT_FILE_TYPES = ['ace', 'ani', 'apk', 'app', 'appx', 'arj', 'bat', 'cab', 'cmd', 'com', 'deb', 'dex', 'dll', 'docm', 'elf', 'exe', 'hta', 'img', 'iso', 'jar', 'jnlp', 'kext', 'lha', 'lib', 'library', 'lnk', 'lzh', 'macho', 'msc', 'msi', 'msix', 'msp', 'mst', 'pif', 'ppa', 'ppam', 'reg', 'rev', 'scf', 'scr', 'sct', 'sys', 'uif', 'vb', 'vbe', 'vbs', 'vxd', 'wsc', 'wsf', 'wsh', 'xll', 'xz', 'z'];

const SECTIONS = {
  organizationConfig: [{ Name: 'contoso.onmicrosoft.com', DisplayName: 'Contoso', Identity: 'contoso.onmicrosoft.com', OAuth2ClientProfileEnabled: true, AuditDisabled: false, AutoExpandingArchiveEnabled: true, DefaultAuthenticationPolicy: 'Block basic auth', FocusedInboxOn: true, WhenChanged: T }],
  transportConfig: [{ Identity: 'Transport Settings', MaxSendSize: '35 MB (36,700,160 bytes)', MaxReceiveSize: '36 MB (37,748,736 bytes)', MaxRecipientEnvelopeLimit: '500', SmtpClientAuthenticationDisabled: true, JournalingReportNdrTo: 'journal-ndr@contoso.com', ExternalPostmasterAddress: null, ReplyAllStormProtectionEnabled: true, ReplyAllStormDetectionMinimumRecipients: 2500, AllowLegacyTLSClients: false }],
  acceptedDomains: [
    { Name: 'contoso.com', DomainName: 'contoso.com', DomainType: 'Authoritative', Default: true, MatchSubDomains: false, WhenChanged: T },
    { Name: 'contoso.onmicrosoft.com', DomainName: 'contoso.onmicrosoft.com', DomainType: 'Authoritative', Default: false, MatchSubDomains: false, WhenChanged: T },
    { Name: 'northwindtraders.com', DomainName: 'northwindtraders.com', DomainType: 'Authoritative', Default: false, MatchSubDomains: false, WhenChanged: T },
  ],
  remoteDomains: [
    { Name: 'Default', DomainName: '*', AutoReplyEnabled: true, AutoForwardEnabled: true, AllowedOOFType: 'External', DeliveryReportEnabled: true, NDREnabled: true, TNEFEnabled: null, ContentType: 'MimeHtmlText', CharacterSet: 'iso-8859-1', IsInternal: false, TrustedMailOutboundEnabled: false },
    { Name: 'Fabrikam', DomainName: 'fabrikam.com', AutoReplyEnabled: true, AutoForwardEnabled: true, AllowedOOFType: 'External', DeliveryReportEnabled: true, NDREnabled: true, TNEFEnabled: true, ContentType: 'MimeHtmlText', CharacterSet: 'utf-8', IsInternal: false, TrustedMailOutboundEnabled: true },
    { Name: 'Personal mail services', DomainName: 'personalmail.example', AutoReplyEnabled: false, AutoForwardEnabled: false, AllowedOOFType: 'None', DeliveryReportEnabled: false, NDREnabled: true, TNEFEnabled: false, ContentType: 'MimeHtmlText', CharacterSet: 'utf-8', IsInternal: false, TrustedMailOutboundEnabled: false },
  ],
  inboundConnectors: [
    { Name: 'Fabrikam partner (TLS, IP-restricted)', Enabled: true, ConnectorType: 'Partner', ConnectorSource: 'Default', SenderDomains: ['smtp:fabrikam.com;1'], SenderIPAddresses: ['203.0.113.0/26'], RestrictDomainsToIPAddresses: true, RestrictDomainsToCertificate: false, RequireTls: true, TlsSenderCertificateName: null, EFSkipIPs: [], EFSkipLastIP: false, EFUsers: [], Comment: 'Fabrikam sends from its own servers only.', WhenChanged: T },
    { Name: 'Payroll vendor relay', Enabled: true, ConnectorType: 'Partner', ConnectorSource: 'Default', SenderDomains: ['smtp:payroll.example;1'], SenderIPAddresses: ['198.51.100.25'], RestrictDomainsToIPAddresses: false, RestrictDomainsToCertificate: false, RequireTls: true, EFSkipIPs: [], EFSkipLastIP: false, Comment: 'Payslips from the payroll service.', WhenChanged: T },
  ],
  outboundConnectors: [
    { Name: 'To Fabrikam (forced TLS)', Enabled: true, ConnectorType: 'Partner', ConnectorSource: 'Default', RecipientDomains: ['fabrikam.com'], SmartHosts: [], UseMXRecord: true, TlsSettings: 'DomainValidation', TlsDomain: '*.fabrikam.com', IsTransportRuleScoped: false, RouteAllMessagesViaOnPremises: false, AllAcceptedDomains: false, CloudServicesMailEnabled: false, Comment: 'Contract requires TLS with Fabrikam.', WhenChanged: T },
    { Name: 'Legal archive relay', Enabled: true, ConnectorType: 'Partner', ConnectorSource: 'Default', RecipientDomains: ['*'], SmartHosts: ['relay.legalarchive.example'], UseMXRecord: false, TlsSettings: 'CertificateValidation', TlsDomain: null, IsTransportRuleScoped: true, RouteAllMessagesViaOnPremises: false, AllAcceptedDomains: false, Comment: 'Used only by the mail flow rule "Route Legal mail through the archive".', WhenChanged: T },
  ],
  transportRules: [
    { Name: 'Block executable attachments', Identity: 'Block executable attachments', Priority: 0, State: 'Enabled', Mode: 'Enforce', StopRuleProcessing: false, AttachmentExtensionMatchesWords: ['exe', 'js', 'vbs', 'scr', 'iso', 'bat'], RejectMessageReasonText: 'Executable attachments are not allowed at Contoso. Send a link instead.', RejectMessageEnhancedStatusCode: '5.7.1', SetAuditSeverity: 'Medium', Comments: 'Before malware scanning catches everything.', WhenChanged: T },
    { Name: 'Bypass spam filtering for Fabrikam', Identity: 'Bypass spam filtering for Fabrikam', Priority: 1, State: 'Enabled', Mode: 'Enforce', StopRuleProcessing: false, SenderDomainIs: ['fabrikam.com'], SetSCL: -1, SetAuditSeverity: 'Low', Comments: 'Added in 2023 after a false positive. Anyone spoofing fabrikam.com also skips spam filtering.', WhenChanged: T },
    { Name: 'Quarantine payment fraud phrases from outside', Identity: 'Quarantine payment fraud phrases from outside', Priority: 2, State: 'Enabled', Mode: 'Enforce', StopRuleProcessing: true, FromScope: 'NotInOrganization', SubjectOrBodyContainsWords: ['wire transfer', 'urgent payment', 'gift cards', 'change of bank details'], ExceptIfSenderDomainIs: ['payroll.example'], Quarantine: true, GenerateIncidentReport: ['security@contoso.com'], SetAuditSeverity: 'High', WhenChanged: T },
    { Name: 'External email warning', Identity: 'External email warning', Priority: 3, State: 'Enabled', Mode: 'Enforce', StopRuleProcessing: false, FromScope: 'NotInOrganization', SentToScope: 'InOrganization', ExceptIfSenderDomainIs: ['fabrikam.com'], PrependSubject: '[EXTERNAL] ', ApplyHtmlDisclaimerLocation: 'Prepend', ApplyHtmlDisclaimerText: '<p style="color:#a4262c">This message came from outside Contoso. Do not open links or attachments unless you expected them.</p>', ApplyHtmlDisclaimerFallbackAction: 'Wrap', WhenChanged: T },
    { Name: 'Encrypt when the subject says secure', Identity: 'Encrypt when the subject says secure', Priority: 4, State: 'Enabled', Mode: 'Enforce', StopRuleProcessing: false, SentToScope: 'NotInOrganization', SubjectContainsWords: ['secure', 'encrypt'], ApplyOME: true, WhenChanged: T },
    { Name: 'Sales disclaimer on outside mail', Identity: 'Sales disclaimer on outside mail', Priority: 5, State: 'Enabled', Mode: 'Enforce', StopRuleProcessing: false, FromMemberOf: ['Sales Team'], SentToScope: 'NotInOrganization', ApplyHtmlDisclaimerLocation: 'Append', ApplyHtmlDisclaimerText: '<p>Contoso Sales. Prices quoted are valid for 30 days.</p>', ApplyHtmlDisclaimerFallbackAction: 'Wrap', WhenChanged: T },
    { Name: 'Manager approval for large attachments to outside', Identity: 'Manager approval for large attachments to outside', Priority: 6, State: 'Enabled', Mode: 'Enforce', StopRuleProcessing: false, FromScope: 'InOrganization', SentToScope: 'NotInOrganization', AttachmentSizeOver: '10 MB (10,485,760 bytes)', ModerateMessageByManager: true, WhenChanged: T },
    { Name: 'Route Legal mail through the archive', Identity: 'Route Legal mail through the archive', Priority: 7, State: 'Enabled', Mode: 'Enforce', StopRuleProcessing: false, FromMemberOf: ['Legal'], SentToScope: 'NotInOrganization', RouteMessageOutboundConnector: 'Legal archive relay', WhenChanged: T },
    { Name: 'Project Falcon must not leave (test)', Identity: 'Project Falcon must not leave (test)', Priority: 8, State: 'Enabled', Mode: 'AuditAndNotify', StopRuleProcessing: false, SentToScope: 'NotInOrganization', SubjectOrBodyContainsWords: ['Project Falcon'], RejectMessageReasonText: 'Project Falcon details may not be sent outside Contoso.', RejectMessageEnhancedStatusCode: '5.7.1', SetAuditSeverity: 'High', Comments: 'Testing before Legal signs off.', WhenChanged: T },
    { Name: 'Stamp a header on Northwind mail', Identity: 'Stamp a header on Northwind mail', Priority: 9, State: 'Enabled', Mode: 'Enforce', StopRuleProcessing: false, RecipientDomainIs: ['northwindtraders.com'], SetHeaderName: 'X-Contoso-Brand', SetHeaderValue: 'Northwind', WhenChanged: T },
    { Name: 'Old marketing redirect (retired)', Identity: 'Old marketing redirect (retired)', Priority: 10, State: 'Disabled', Mode: 'Enforce', StopRuleProcessing: false, SentTo: ['info@contoso.com'], RedirectMessageTo: ['marketing@contoso.com'], WhenChanged: T },
  ],
  journalRules: [
    { Name: 'Journal mail with outside parties', Identity: 'Journal mail with outside parties', Enabled: true, Scope: 'External', Recipient: null, JournalEmailAddress: 'journal@legalarchive.example', WhenChanged: T },
    { Name: 'Journal the executives', Identity: 'Journal the executives', Enabled: true, Scope: 'Global', Recipient: 'executives@contoso.com', JournalEmailAddress: 'journal@legalarchive.example', WhenChanged: T },
  ],
  externalInOutlook: [{ Identity: 'contoso.onmicrosoft.com', Enabled: true, AllowList: ['fabrikam.com'] }],
  arcConfig: [{ Identity: 'contoso.onmicrosoft.com', ArcTrustedSealers: 'listserv.example' }],
  dkimSigningConfig: [
    { Domain: 'contoso.com', Name: 'contoso.com', Enabled: true, Status: 'Valid', Selector1CNAME: 'selector1-contoso-com._domainkey.contoso.onmicrosoft.com', Selector2CNAME: 'selector2-contoso-com._domainkey.contoso.onmicrosoft.com', KeySize: 2048 },
    { Domain: 'contoso.onmicrosoft.com', Name: 'contoso.onmicrosoft.com', Enabled: true, Status: 'Valid', KeySize: 2048 },
    { Domain: 'northwindtraders.com', Name: 'northwindtraders.com', Enabled: false, Status: 'CnameMissing', KeySize: 2048 },
  ],

  connectionFilterPolicies: [{ Name: 'Default', Identity: 'Default', IsDefault: true, IPAllowList: ['198.51.100.25'], IPBlockList: ['192.0.2.0/24'], EnableSafeList: false }],
  antiSpamPolicies: [
    { Name: 'Default', Identity: 'Default', IsDefault: true, SpamAction: 'MoveToJmf', HighConfidenceSpamAction: 'Quarantine', PhishSpamAction: 'Quarantine', HighConfidencePhishAction: 'Quarantine', BulkSpamAction: 'MoveToJmf', BulkThreshold: 7, SpamQuarantineTag: 'DefaultFullAccessPolicy', HighConfidenceSpamQuarantineTag: 'DefaultFullAccessPolicy', PhishQuarantineTag: 'DefaultFullAccessWithNotificationPolicy', HighConfidencePhishQuarantineTag: 'AdminOnlyAccessPolicy', BulkQuarantineTag: 'DefaultFullAccessPolicy', AllowedSenders: [], AllowedSenderDomains: ['marketingpartner.example'], BlockedSenders: [], BlockedSenderDomains: ['cheap-meds.example'], MarkAsSpamBulkMail: 'On', EnableRegionBlockList: false, EnableLanguageBlockList: false, QuarantineRetentionPeriod: 30 },
    { Name: 'Sales anti-spam', Identity: 'Sales anti-spam', IsDefault: false, SpamAction: 'Quarantine', HighConfidenceSpamAction: 'Quarantine', PhishSpamAction: 'Quarantine', HighConfidencePhishAction: 'Quarantine', BulkSpamAction: 'MoveToJmf', BulkThreshold: 5, SpamQuarantineTag: 'Contoso limited with notifications', HighConfidenceSpamQuarantineTag: 'Contoso limited with notifications', PhishQuarantineTag: 'DefaultFullAccessWithNotificationPolicy', HighConfidencePhishQuarantineTag: 'AdminOnlyAccessPolicy', BulkQuarantineTag: 'DefaultFullAccessPolicy', AllowedSenders: [], AllowedSenderDomains: [], BlockedSenders: [], BlockedSenderDomains: [], QuarantineRetentionPeriod: 30 },
    { Name: 'Strict Preset Security Policy1700000000001', Identity: 'Strict Preset Security Policy1700000000001', IsDefault: false, RecommendedPolicyType: 'Strict', SpamAction: 'Quarantine', HighConfidenceSpamAction: 'Quarantine', PhishSpamAction: 'Quarantine', HighConfidencePhishAction: 'Quarantine', BulkSpamAction: 'Quarantine', BulkThreshold: 5, SpamQuarantineTag: 'DefaultFullAccessWithNotificationPolicy', HighConfidenceSpamQuarantineTag: 'DefaultFullAccessWithNotificationPolicy', PhishQuarantineTag: 'DefaultFullAccessWithNotificationPolicy', HighConfidencePhishQuarantineTag: 'AdminOnlyAccessPolicy', BulkQuarantineTag: 'DefaultFullAccessWithNotificationPolicy' },
  ],
  antiSpamRules: [
    { Name: 'Sales anti-spam', Identity: 'Sales anti-spam', HostedContentFilterPolicy: 'Sales anti-spam', Priority: 0, State: 'Enabled', SentToMemberOf: ['Sales Team'], SentTo: [], RecipientDomainIs: [], ExceptIfSentTo: [], ExceptIfSentToMemberOf: [], ExceptIfRecipientDomainIs: [] },
  ],
  outboundSpamPolicies: [
    { Name: 'Default', Identity: 'Default', IsDefault: true, AutoForwardingMode: 'Automatic', RecipientLimitExternalPerHour: 500, RecipientLimitInternalPerHour: 1000, RecipientLimitPerDay: 1000, ActionWhenThresholdReached: 'BlockUserForToday', NotifyOutboundSpam: true, NotifyOutboundSpamRecipients: ['security@contoso.com'] },
    { Name: 'Executives may forward', Identity: 'Executives may forward', IsDefault: false, AutoForwardingMode: 'On', RecipientLimitExternalPerHour: 500, RecipientLimitInternalPerHour: 1000, RecipientLimitPerDay: 1000, ActionWhenThresholdReached: 'BlockUserForToday' },
  ],
  outboundSpamRules: [
    { Name: 'Executives may forward', Identity: 'Executives may forward', HostedOutboundSpamFilterPolicy: 'Executives may forward', Priority: 0, State: 'Enabled', FromMemberOf: ['Executives'], From: [], SenderDomainIs: [] },
  ],
  antiMalwarePolicies: [
    { Name: 'Default', Identity: 'Default', IsDefault: true, EnableFileFilter: true, FileTypeAction: 'Reject', FileTypes: DEFAULT_FILE_TYPES, QuarantineTag: 'AdminOnlyAccessPolicy', ZapEnabled: true, EnableInternalSenderAdminNotifications: false, EnableExternalSenderAdminNotifications: false },
    { Name: 'Strict Preset Security Policy1700000000002', Identity: 'Strict Preset Security Policy1700000000002', IsDefault: false, RecommendedPolicyType: 'Strict', EnableFileFilter: true, FileTypeAction: 'Reject', FileTypes: DEFAULT_FILE_TYPES, QuarantineTag: 'AdminOnlyAccessPolicy', ZapEnabled: true },
  ],
  antiMalwareRules: [],
  antiPhishPolicies: [
    { Name: 'Office365 AntiPhish Default', Identity: 'Office365 AntiPhish Default', IsDefault: true, Enabled: true, EnableSpoofIntelligence: true, HonorDmarcPolicy: true, DmarcRejectAction: 'Reject', DmarcQuarantineAction: 'Quarantine', AuthenticationFailAction: 'MoveToJmf', SpoofQuarantineTag: 'DefaultFullAccessPolicy', EnableUnauthenticatedSender: true, EnableViaTag: true, EnableFirstContactSafetyTips: false, EnableTargetedUserProtection: false, EnableOrganizationDomainsProtection: false, EnableTargetedDomainsProtection: false, EnableMailboxIntelligence: true, PhishThresholdLevel: 1 },
    { Name: 'Contoso impersonation protection', Identity: 'Contoso impersonation protection', IsDefault: false, Enabled: true, EnableSpoofIntelligence: true, HonorDmarcPolicy: true, DmarcRejectAction: 'Reject', DmarcQuarantineAction: 'Quarantine', AuthenticationFailAction: 'Quarantine', SpoofQuarantineTag: 'DefaultFullAccessWithNotificationPolicy', EnableUnauthenticatedSender: true, EnableFirstContactSafetyTips: true, EnableTargetedUserProtection: true, TargetedUsersToProtect: ['Megan Bowen;megan.bowen@contoso.com', 'Alex Wilber;alex.wilber@contoso.com', 'Patti Fernandez;patti.fernandez@contoso.com'], TargetedUserProtectionAction: 'Quarantine', TargetedUserQuarantineTag: 'AdminOnlyAccessPolicy', EnableOrganizationDomainsProtection: true, EnableTargetedDomainsProtection: true, TargetedDomainsToProtect: ['fabrikam.com'], TargetedDomainProtectionAction: 'Quarantine', TargetedDomainQuarantineTag: 'AdminOnlyAccessPolicy', ExcludedSenders: [], ExcludedDomains: [], EnableMailboxIntelligence: true, EnableMailboxIntelligenceProtection: true, PhishThresholdLevel: 2 },
  ],
  antiPhishRules: [
    { Name: 'Contoso impersonation protection', Identity: 'Contoso impersonation protection', AntiPhishPolicy: 'Contoso impersonation protection', Priority: 0, State: 'Enabled', RecipientDomainIs: ['contoso.com'], SentTo: [], SentToMemberOf: [], ExceptIfSentToMemberOf: ['Executives'] },
  ],
  safeLinksPolicies: [
    { Name: 'Built-In Protection Policy', Identity: 'Built-In Protection Policy', IsBuiltInProtection: true, EnableSafeLinksForEmail: true, EnableSafeLinksForTeams: true, EnableSafeLinksForOffice: true, TrackClicks: true, AllowClickThrough: true, ScanUrls: true, EnableForInternalSenders: false, DeliverMessageAfterScan: true, DisableUrlRewrite: false, DoNotRewriteUrls: [] },
    { Name: 'Contoso Safe Links', Identity: 'Contoso Safe Links', IsBuiltInProtection: false, EnableSafeLinksForEmail: true, EnableSafeLinksForTeams: true, EnableSafeLinksForOffice: true, TrackClicks: true, AllowClickThrough: false, ScanUrls: true, EnableForInternalSenders: true, DeliverMessageAfterScan: true, DisableUrlRewrite: false, DoNotRewriteUrls: ['https://intranet.contoso.com/*'] },
  ],
  safeLinksRules: [
    { Name: 'Contoso Safe Links', Identity: 'Contoso Safe Links', SafeLinksPolicy: 'Contoso Safe Links', Priority: 0, State: 'Enabled', RecipientDomainIs: ['contoso.com', 'northwindtraders.com'], SentTo: [], SentToMemberOf: [] },
  ],
  safeAttachmentPolicies: [
    { Name: 'Built-In Protection Policy', Identity: 'Built-In Protection Policy', IsBuiltInProtection: true, Enable: true, Action: 'Block', QuarantineTag: 'AdminOnlyAccessPolicy', Redirect: false },
    { Name: 'Contoso Safe Attachments', Identity: 'Contoso Safe Attachments', IsBuiltInProtection: false, Enable: true, Action: 'DynamicDelivery', QuarantineTag: 'AdminOnlyAccessPolicy', Redirect: true, RedirectAddress: 'soc@contoso.com' },
  ],
  safeAttachmentRules: [
    { Name: 'Contoso Safe Attachments', Identity: 'Contoso Safe Attachments', SafeAttachmentPolicy: 'Contoso Safe Attachments', Priority: 0, State: 'Enabled', RecipientDomainIs: ['contoso.com'], SentTo: [], SentToMemberOf: [] },
  ],
  atpPolicyForO365: [{ Identity: 'Default', EnableATPForSPOTeamsODB: true, EnableSafeDocs: true, AllowSafeDocsOpen: false }],
  presetEopRules: [
    { Name: 'Strict Preset Security Policy', Identity: 'Strict Preset Security Policy', State: 'Enabled', Priority: 0, SentToMemberOf: ['Executives'], SentTo: [], RecipientDomainIs: [], HostedContentFilterPolicy: 'Strict Preset Security Policy1700000000001', AntiPhishPolicy: 'Strict Preset Security Policy1700000000003', MalwareFilterPolicy: 'Strict Preset Security Policy1700000000002' },
    { Name: 'Standard Preset Security Policy', Identity: 'Standard Preset Security Policy', State: 'Disabled', Priority: 1, SentTo: [], SentToMemberOf: [], RecipientDomainIs: [] },
  ],
  presetAtpRules: [
    { Name: 'Strict Preset Security Policy', Identity: 'Strict Preset Security Policy', State: 'Enabled', Priority: 0, SentToMemberOf: ['Executives'], SafeLinksPolicy: 'Strict Preset Security Policy1700000000004', SafeAttachmentPolicy: 'Strict Preset Security Policy1700000000005' },
  ],
  builtInProtectionRule: [{ Name: 'ATP Built-In Protection Rule', Identity: 'ATP Built-In Protection Rule', State: 'Enabled', SafeLinksPolicy: 'Built-In Protection Policy', SafeAttachmentPolicy: 'Built-In Protection Policy', ExceptIfRecipientDomainIs: [] }],
  tenantAllowBlockSenders: [
    { Value: 'cheap-meds.example', Action: 'Block', ListType: 'Sender', ExpirationDate: null, Notes: 'Pharmacy spam.', LastModifiedDateTime: T },
    { Value: 'invoices@tailspintoys.example', Action: 'Block', ListType: 'Sender', ExpirationDate: null, Notes: 'Compromised vendor account, March.', LastModifiedDateTime: T },
    { Value: 'newsletter@wingtiptoys.example', Action: 'Allow', ListType: 'Sender', ExpirationDate: '2026-12-31T00:00:00Z', Notes: 'False positive submission.', LastModifiedDateTime: T },
  ],
  tenantAllowBlockUrls: [
    { Value: '*.malicious.example/*', Action: 'Block', ListType: 'Url', ExpirationDate: null, Notes: 'Credential phishing kit.' },
  ],
  tenantAllowBlockFiles: [
    { Value: '3b4ec0a7f8d1c2e0b5a69d4f1e2c3b4a5d6e7f8091a2b3c4d5e6f708192a3b4c', Action: 'Block', ListType: 'FileHash', ExpirationDate: null, Notes: 'Ransomware loader.' },
  ],
  tenantAllowBlockIPs: [],
  tenantAllowBlockSpoof: [
    { SpoofedUser: 'contoso.com', SendingInfrastructure: 'mailer.marketingpartner.example', SpoofType: 'Internal', Action: 'Allow' },
  ],
  quarantinePolicies: [
    { Name: 'AdminOnlyAccessPolicy', Identity: 'AdminOnlyAccessPolicy', EndUserQuarantinePermissionsValue: 0, ESNEnabled: false },
    { Name: 'DefaultFullAccessPolicy', Identity: 'DefaultFullAccessPolicy', EndUserQuarantinePermissionsValue: 23, ESNEnabled: false },
    { Name: 'DefaultFullAccessWithNotificationPolicy', Identity: 'DefaultFullAccessWithNotificationPolicy', EndUserQuarantinePermissionsValue: 23, ESNEnabled: true },
    { Name: 'Contoso limited with notifications', Identity: 'Contoso limited with notifications', EndUserQuarantinePermissionsValue: 27, EndUserQuarantinePermissions: 'PermissionToBlockSender: True, PermissionToDelete: True, PermissionToPreview: True, PermissionToRelease: False, PermissionToRequestRelease: True', ESNEnabled: true },
  ],
  secOpsOverridePolicy: [{ Name: 'SecOpsOverridePolicy', Identity: 'SecOpsOverridePolicy', SentTo: ['soc@contoso.com'] }],
  secOpsOverrideRules: [{ Name: '_Exe:SecOpsOverrid:1f2e3d4c', Identity: '_Exe:SecOpsOverrid:1f2e3d4c', Policy: 'SecOpsOverridePolicy', SentTo: ['soc@contoso.com'] }],
  phishSimOverridePolicy: [{ Name: 'PhishSimOverridePolicy', Identity: 'PhishSimOverridePolicy', Enabled: true }],
  phishSimOverrideRules: [{ Name: '_Exe:PhishSimOverr:2a3b4c5d', Identity: '_Exe:PhishSimOverr:2a3b4c5d', Policy: 'PhishSimOverridePolicy', Domains: ['phishtraining.example'], SenderIpRanges: ['203.0.113.200'] }],

  irmConfiguration: [{ Identity: 'ControlPoint Configuration', AzureRMSLicensingEnabled: true, InternalLicensingEnabled: true, SimplifiedClientAccessEnabled: true, DecryptAttachmentForEncryptOnly: false, ClientSecret: '(removed: may hold a secret)' }],
  omeConfiguration: [{ Identity: 'OME Configuration', BackgroundColor: '#0078d4', DisclaimerText: 'Encrypted by Contoso.', IntroductionText: 'has sent you a secure message.', Image: '(binary, 4096 bytes; not exported)', OTPEnabled: true, SocialIdSignIn: true }],
  rmsTemplates: [
    { Name: 'Encrypt', Identity: 'Encrypt', Type: 'Archived', TemplateId: 'aaaaaaaa-0000-4000-8000-0000000000f1' },
    { Name: 'Do Not Forward', Identity: 'Do Not Forward', Type: 'Distributed', TemplateId: 'aaaaaaaa-0000-4000-8000-0000000000f2' },
  ],

  mrmRetentionPolicies: [{ Name: 'Contoso 2-year mailbox', Identity: 'Contoso 2-year mailbox', IsDefault: false, RetentionPolicyTagLinks: ['Default 2 years move to archive', 'Deleted Items 30 days', 'Junk Email 30 days'] }],
  mrmRetentionTags: [
    { Name: 'Default 2 years move to archive', Type: 'All', AgeLimitForRetention: '730.00:00:00', RetentionAction: 'MoveToArchive', RetentionEnabled: true },
    { Name: 'Deleted Items 30 days', Type: 'DeletedItems', AgeLimitForRetention: '30.00:00:00', RetentionAction: 'DeleteAndAllowRecovery', RetentionEnabled: true },
    { Name: 'Junk Email 30 days', Type: 'JunkEmail', AgeLimitForRetention: '30.00:00:00', RetentionAction: 'DeleteAndAllowRecovery', RetentionEnabled: true },
  ],

  mailbox: [{
    Name: 'megan.bowen', Alias: 'megan.bowen', DisplayName: 'Megan Bowen', Identity: 'megan.bowen', DistinguishedName: MEGAN_DN, ExternalDirectoryObjectId: 'aaaaaaaa-0000-4000-8000-0000000000a1',
    PrimarySmtpAddress: MB, WindowsEmailAddress: MB, UserPrincipalName: MB, RecipientTypeDetails: 'UserMailbox',
    EmailAddresses: ['SMTP:megan.bowen@contoso.com', 'smtp:megan@contoso.com', 'smtp:megan.bowen@contoso.onmicrosoft.com', 'smtp:megan.bowen@northwindtraders.com'],
    ForwardingSmtpAddress: null, ForwardingAddress: null, DeliverToMailboxAndForward: false,
    RequireSenderAuthenticationEnabled: false, AcceptMessagesOnlyFrom: [], AcceptMessagesOnlyFromDLMembers: [], RejectMessagesFrom: [], RejectMessagesFromDLMembers: [], GrantSendOnBehalfTo: ['alex.wilber'],
    MaxSendSize: '35 MB (36,700,160 bytes)', MaxReceiveSize: '36 MB (37,748,736 bytes)', ProhibitSendQuota: '99 GB (106,300,440,576 bytes)', ProhibitSendReceiveQuota: '100 GB (107,374,182,400 bytes)', IssueWarningQuota: '98 GB (105,226,698,752 bytes)',
    LitigationHoldEnabled: false, LitigationHoldDuration: 'Unlimited', InPlaceHolds: ['UniHf3a9c2d1-0000-4c1b-9a2d-00000000b001'], RetentionPolicy: 'Contoso 2-year mailbox', ArchiveStatus: 'Active', AuditEnabled: true, HiddenFromAddressListsEnabled: false,
    WhenChanged: T,
  }],
  mailboxMemberOf: [
    { DisplayName: 'Sales Team', Name: 'Sales Team', Alias: 'sales', PrimarySmtpAddress: 'sales@contoso.com', RecipientTypeDetails: 'MailUniversalDistributionGroup', ExternalDirectoryObjectId: 'aaaaaaaa-0000-4000-8000-0000000000c1' },
    { DisplayName: 'All Staff', Name: 'All Staff', Alias: 'allstaff', PrimarySmtpAddress: 'allstaff@contoso.com', RecipientTypeDetails: 'GroupMailbox', ExternalDirectoryObjectId: 'aaaaaaaa-0000-4000-8000-0000000000c2' },
  ],
  mailboxUser: [{ Name: 'megan.bowen', DisplayName: 'Megan Bowen', UserPrincipalName: MB, Department: 'Sales', Title: 'Account Executive', Office: 'Seattle', City: 'Seattle', CountryOrRegion: 'United States', Company: 'Contoso', Manager: 'Alex Wilber', RecipientTypeDetails: 'UserMailbox' }],
  casMailbox: [{ Name: 'megan.bowen', PrimarySmtpAddress: MB, SmtpClientAuthenticationDisabled: null, ActiveSyncEnabled: true, OWAEnabled: true, PopEnabled: false, ImapEnabled: false, MAPIEnabled: true, EwsEnabled: true }],
  mailboxStatistics: [{ DisplayName: 'Megan Bowen', TotalItemSize: '4.21 GB (4,520,513,536 bytes)', ItemCount: 18234, LastLogonTime: '2026-11-21T16:40:00.0000000Z' }],
  inboxRules: [
    { Name: 'Invoices to my home address', Identity: 'megan.bowen\\1234567890', Enabled: true, Priority: 1, SubjectContainsWords: ['invoice'], ForwardTo: ['"Megan (home)" [SMTP:megan.home@personalmail.example]'], StopProcessingRules: false, InError: false, Description: 'If the message includes "invoice" in the subject, forward the message to Megan (home).' },
    { Name: 'Newsletters to Reading', Identity: 'megan.bowen\\1234567891', Enabled: true, Priority: 2, FromAddressContainsWords: ['newsletter'], MoveToFolder: 'megan.bowen:\\Reading', MarkAsRead: false, StopProcessingRules: false, InError: false },
  ],
  mailboxPermissions: [{ Identity: 'megan.bowen', User: 'alex.wilber@contoso.com', AccessRights: ['FullAccess'], IsInherited: false, Deny: false }],
  recipientPermissions: [{ Identity: 'megan.bowen', Trustee: 'NT AUTHORITY\\SELF', AccessRights: ['SendAs'], IsInherited: false }],
  calendarPermissions: [
    { FolderName: 'Calendar', User: 'Default', AccessRights: ['AvailabilityOnly'] },
    { FolderName: 'Calendar', User: 'Alex Wilber', AccessRights: ['Editor'], SharingPermissionFlags: 'Delegate' },
  ],
  autoReply: [{ Identity: 'megan.bowen', AutoReplyState: 'Disabled', ExternalAudience: 'Known', InternalMessage: '', ExternalMessage: '' }],
  junkEmailConfig: [{ Identity: 'megan.bowen', Enabled: true, TrustedSendersAndDomains: ['fabrikam.com'], BlockedSendersAndDomains: ['deals@wingtiptoys.example'], ContactsTrusted: true, TrustedListsOnly: false }],

  dlpPolicies: [
    { Name: 'U.S. Financial Data', Identity: 'U.S. Financial Data', Mode: 'Enable', Enabled: true, Workload: ['Exchange', 'SharePoint', 'OneDriveForBusiness', 'Teams'], ExchangeLocation: ['All'], ExchangeLocationException: [], DistributionStatus: 'Success', Priority: 0 },
    { Name: 'Sales confidential', Identity: 'Sales confidential', Mode: 'TestWithNotifications', Enabled: true, Workload: ['Exchange'], ExchangeLocation: ['All'], ExchangeLocationException: [], DistributionStatus: 'Pending', Priority: 1 },
  ],
  dlpRules: [
    { Name: 'Block credit cards going outside', Identity: 'Block credit cards going outside', ParentPolicyName: 'U.S. Financial Data', Priority: 0, Disabled: false, ContentContainsSensitiveInformation: [CCN], AccessScope: 'NotInOrganization', BlockAccess: true, BlockAccessScope: 'All', NotifyUser: ['LastModifier'], NotifyPolicyTipCustomText: 'Credit card numbers cannot be emailed outside Contoso.', NotifyAllowOverride: [], GenerateIncidentReport: ['compliance@contoso.com'], ReportSeverityLevel: 'High', GenerateAlert: ['SiteAdmin'] },
    { Name: 'Warn on SSNs going outside', Identity: 'Warn on SSNs going outside', ParentPolicyName: 'U.S. Financial Data', Priority: 1, Disabled: false, ContentContainsSensitiveInformation: [SSN], AccessScope: 'NotInOrganization', BlockAccess: true, BlockAccessScope: 'All', NotifyUser: ['LastModifier'], NotifyAllowOverride: ['WithJustification'], GenerateIncidentReport: ['compliance@contoso.com'], ReportSeverityLevel: 'Medium' },
    { Name: 'Price lists stay inside', Identity: 'Price lists stay inside', ParentPolicyName: 'Sales confidential', Priority: 0, Disabled: false, SubjectOrBodyContainsWords: ['price list', 'discount schedule'], AccessScope: 'NotInOrganization', BlockAccess: true, BlockAccessScope: 'All', NotifyUser: ['LastModifier'] },
  ],
  dlpSensitiveInformationTypes: [
    { Name: 'Credit Card Number', Id: '50842eb7-edc8-4019-85dd-5a5c1f2bb085', Publisher: 'Microsoft Corporation', Type: 'Entity' },
    { Name: 'U.S. Social Security Number (SSN)', Id: 'a44669fe-0d48-453d-a9b1-2cc83f2cba77', Publisher: 'Microsoft Corporation', Type: 'Entity' },
    { Name: 'International Banking Account Number (IBAN)', Id: 'e7dc4711-11b7-4cb0-b88b-2c394a771f0e', Publisher: 'Microsoft Corporation', Type: 'Entity' },
  ],
  sensitivityLabels: [
    { Name: 'Public', DisplayName: 'Public', Guid: LABEL.public, ImmutableId: LABEL.public, Priority: 0, EncryptionEnabled: false, ContentType: 'File, Email' },
    { Name: 'General', DisplayName: 'General', Guid: LABEL.general, ImmutableId: LABEL.general, Priority: 1, EncryptionEnabled: false, ContentType: 'File, Email' },
    { Name: 'Confidential', DisplayName: 'Confidential', Guid: LABEL.confidential, ImmutableId: LABEL.confidential, Priority: 2, EncryptionEnabled: false, ContentType: 'File, Email', ApplyContentMarkingFooterEnabled: true, ApplyContentMarkingFooterText: 'Confidential' },
    { Name: 'Highly Confidential', DisplayName: 'Highly Confidential', Guid: LABEL.highly, ImmutableId: LABEL.highly, Priority: 3, EncryptionEnabled: true, EncryptionProtectionType: 'Template', ContentType: 'File, Email' },
  ],
  labelPolicies: [{ Name: 'Contoso labels', Identity: 'Contoso labels', Labels: ['Public', 'General', 'Confidential', 'Highly Confidential'], ExchangeLocation: ['All'], Settings: ['[mandatory, false]', '[defaultlabelid, aaaaaaaa-0000-4000-8000-0000000000e2]'], Enabled: true }],
  autoLabelPolicies: [
    { Name: 'Label credit cards Confidential', Identity: 'Label credit cards Confidential', Mode: 'Enable', Enabled: true, ExchangeLocation: ['All'], ApplySensitivityLabel: LABEL.confidential, DistributionStatus: 'Success' },
    { Name: 'Label IBANs Highly Confidential (simulation)', Identity: 'Label IBANs Highly Confidential (simulation)', Mode: 'TestWithoutNotifications', Enabled: true, ExchangeLocation: ['All'], ApplySensitivityLabel: LABEL.highly, DistributionStatus: 'Success' },
  ],
  autoLabelRules: [
    { Name: 'Credit cards in email', Identity: 'Credit cards in email', ParentPolicyName: 'Label credit cards Confidential', Workload: 'Exchange', Disabled: false, ContentContainsSensitiveInformation: [CCN] },
    { Name: 'IBANs in email', Identity: 'IBANs in email', ParentPolicyName: 'Label IBANs Highly Confidential (simulation)', Workload: 'Exchange', Disabled: false, ContentContainsSensitiveInformation: [{ name: 'International Banking Account Number (IBAN)', id: 'e7dc4711-11b7-4cb0-b88b-2c394a771f0e', mincount: '1' }] },
  ],
  retentionPolicies: [{ Name: 'Contoso mailboxes 7 years', Identity: 'Contoso mailboxes 7 years', Enabled: true, Mode: 'Enforce', ExchangeLocation: ['All'], DistributionStatus: 'Success' }],
  retentionRules: [{ Name: 'Contoso mailboxes 7 years rule', Policy: 'Contoso mailboxes 7 years', RetentionDuration: 2555, RetentionComplianceAction: 'Keep', ExpirationDateOption: 'CreationAgeInDays' }],
  retentionLabels: [{ Name: 'Contract - 10 years', Identity: 'Contract - 10 years', RetentionDuration: 3650, RetentionAction: 'Keep', IsRecordLabel: false }],
  complianceCases: [{ Name: 'Project Falcon', Identity: 'aaaaaaaa-0000-4000-8000-0000000000d1', CaseType: 'eDiscovery', Status: 'Active', CreatedDateTime: T }],
  caseHoldPolicies: [{ Name: 'Falcon custodians', Identity: 'Falcon custodians', CaseId: 'aaaaaaaa-0000-4000-8000-0000000000d1', Enabled: true, ExchangeLocation: [MB, 'alex.wilber@contoso.com'], DistributionStatus: 'Success' }],
  caseHoldRules: [{ Name: 'Falcon custodians rule', Policy: 'Falcon custodians', ContentMatchQuery: 'falcon OR "project f"', Disabled: false }],
};

function commandFor(name) {
  return SECTION_META[name][4].replace(/<mailbox>/g, MB).replace(/<mailbox DN>/g, MEGAN_DN);
}

// The sample as an export file. A fresh copy each call, so a page that edits it never changes the original.
export function sampleExport() {
  const sections = {};
  for (const [name, [group, direction, session, title]] of Object.entries(SECTION_META)) {
    const list = SECTIONS[name] || [];
    sections[name] = { title, group, direction, session, command: commandFor(name), status: list.length ? 'ok' : 'empty', count: list.length, items: JSON.parse(JSON.stringify(list)), error: null, warnings: [], durationMs: 0 };
  }
  const summary = { sections: 0, ok: 0, empty: 0, error: 0, unavailable: 0, skipped: 0 };
  for (const s of Object.values(sections)) { summary.sections++; summary[s.status]++; }
  return {
    format: 'sectechtalk.mailflow-config',
    version: 1,
    generatedAt: '2026-11-22T08:00:00.0000000Z',
    generator: { name: 'Contoso sample topology (lib/nexthop-sample.js)', version: '1.1.0', powershell: 'not run: fictional sample', exchangeOnlineManagement: null },
    readOnly: true,
    sample: true,
    tenant: { organization: 'contoso.onmicrosoft.com', tenantId: 'aaaaaaaa-0000-4000-8000-00000000c0de', signedInAs: 'admin@contoso.onmicrosoft.com', defaultDomain: 'contoso.com' },
    mailbox: { address: MB },
    connections: { exchangeOnline: { status: 'existing', error: null }, compliance: { status: 'existing', error: null } },
    summary,
    sections,
    secretsRemoved: ['sections.irmConfiguration.items[0].ClientSecret'],
    truncated: [],
    notes: [
      'Fictional Contoso sample topology for NextHop. It was not exported from any tenant.',
      'Same shape as Export-MailFlowConfig.ps1 output, so NextHop reads it the same way as a real export.',
    ],
  };
}
