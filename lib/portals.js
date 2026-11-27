// Every place an admin can change a setting. The most direct portal is first.
// Ex360 does not check whether the signed-in person can open the portal. The portal does.
const EAC = 'https://admin.exchange.microsoft.com';
const DEFENDER = 'https://security.microsoft.com';
const PURVIEW = 'https://purview.microsoft.com';
const ENTRA = 'https://entra.microsoft.com';
const M365 = 'https://admin.microsoft.com';

function link(name, url) { return { name, url }; }

export const PORTALS = [
  {
    id: 'eac-home',
    title: 'Exchange admin center',
    powershell: 'Get-OrganizationConfig | Format-List Name, DisplayName',
    links: [
      link('Exchange admin center — home', `${EAC}/#/homepage`),
      link('Microsoft 365 admin center — home', `${M365}/Adminportal/Home#/homepage`),
    ],
  },
  {
    id: 'app-consent',
    title: 'The Ex360 app registration and admin consent',
    powershell: 'Get-MgServicePrincipal -Filter "displayName eq \'Ex360\'" | Format-List DisplayName, AppId',
    links: [
      link('Microsoft Entra admin center — enterprise applications', `${ENTRA}/#view/Microsoft_AAD_IAM/StartboardApplicationsMenuBlade/~/AppAppsPreview`),
      link('Microsoft Entra admin center — app registrations', `${ENTRA}/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade`),
    ],
  },
  {
    id: 'header-analyzer',
    title: 'Message headers',
    powershell: 'Get-MessageTraceV2 -MessageId <message-id> -StartDate (Get-Date).AddDays(-10) -EndDate (Get-Date)',
    links: [
      link('Microsoft Message Header Analyzer', 'https://mha.azurewebsites.net/'),
      link('Exchange admin center — message trace', `${EAC}/#/messagetrace`),
    ],
  },
  {
    id: 'licenses',
    title: 'Licenses and subscriptions',
    powershell: 'Get-MgSubscribedSku | Select-Object SkuPartNumber, ConsumedUnits',
    links: [
      link('Microsoft 365 admin center — licenses', `${M365}/Adminportal/Home#/licenses`),
      link('Microsoft 365 admin center — billing', `${M365}/Adminportal/Home#/subscriptions`),
      link('Microsoft Entra admin center — licenses', `${ENTRA}/#view/Microsoft_AAD_IAM/LicensesMenuBlade/~/Products`),
    ],
  },
  {
    id: 'accepted-domains',
    title: 'Accepted domains',
    powershell: 'Get-AcceptedDomain | Format-List DomainName, DomainType, Default',
    links: [
      link('Exchange admin center — accepted domains', `${EAC}/#/accepteddomains`),
      link('Microsoft 365 admin center — domains', `${M365}/Adminportal/Home#/Domains`),
      link('Microsoft Entra admin center — domain names', `${ENTRA}/#view/Microsoft_AAD_IAM/DomainsManagementMenuBlade/~/CustomDomainNames`),
    ],
  },
  {
    id: 'domains',
    title: 'Domains',
    powershell: 'Get-MgDomain | Select-Object Id, IsDefault, IsVerified',
    links: [
      link('Microsoft 365 admin center — domains', `${M365}/Adminportal/Home#/Domains`),
      link('Microsoft Entra admin center — domain names', `${ENTRA}/#view/Microsoft_AAD_IAM/DomainsManagementMenuBlade/~/CustomDomainNames`),
    ],
  },
  {
    id: 'remote-domains',
    title: 'Remote domains',
    powershell: 'Get-RemoteDomain | Format-List Name, DomainName, AutoForwardEnabled, AllowedOOFType',
    links: [
      link('Exchange admin center — remote domains', `${EAC}/#/remotedomains`),
    ],
  },
  {
    id: 'dkim',
    title: 'DKIM',
    powershell: 'Get-DkimSigningConfig | Format-List Domain, Enabled, Selector1CNAME, Selector2CNAME',
    links: [
      link('Microsoft Defender portal — email authentication, DKIM', `${DEFENDER}/authentication?viewid=DKIM`),
      link('Exchange admin center — DKIM', `${EAC}/#/dkim`),
      link('Microsoft 365 Defender (same authentication page)', `${DEFENDER}/authentication`),
    ],
  },
  {
    id: 'connectors',
    title: 'Connectors',
    powershell: 'Get-InboundConnector; Get-OutboundConnector',
    links: [
      link('Exchange admin center — connectors', `${EAC}/#/connectors`),
      link('Microsoft Defender portal — connectors', `${DEFENDER}/connectors`),
    ],
  },
  {
    id: 'transport-rules',
    title: 'Mail flow rules',
    powershell: 'Get-TransportRule | Sort-Object Priority | Format-Table Name, State, Priority, Mode',
    links: [
      link('Exchange admin center — rules', `${EAC}/#/transportrules`),
      link('Microsoft Defender portal — mail flow rules', `${DEFENDER}/transportrules`),
    ],
  },
  {
    id: 'anti-spam',
    title: 'Anti-spam policies',
    powershell: 'Get-HostedContentFilterRule | Sort-Object Priority | Format-Table Name, Priority, State; Get-HostedContentFilterPolicy',
    links: [
      link('Microsoft Defender portal — anti-spam', `${DEFENDER}/antispam`),
      link('Microsoft 365 Defender portal home', `${DEFENDER}/homepage`),
    ],
  },
  {
    id: 'anti-phish',
    title: 'Anti-phishing policies',
    powershell: 'Get-AntiPhishPolicy | Format-List Name, Enabled, PhishThresholdLevel',
    links: [
      link('Microsoft Defender portal — anti-phishing', `${DEFENDER}/antiphishing`),
      link('Exchange admin center', `${EAC}/`),
    ],
  },
  {
    id: 'safe-links',
    title: 'Safe Links',
    powershell: 'Get-SafeLinksPolicy; Get-SafeLinksRule | Sort-Object Priority',
    links: [
      link('Microsoft Defender portal — Safe Links', `${DEFENDER}/safelinksv2`),
      link('Microsoft Defender portal — preset security policies', `${DEFENDER}/presetSecurityPolicies`),
    ],
  },
  {
    id: 'safe-attachments',
    title: 'Safe Attachments',
    powershell: 'Get-SafeAttachmentPolicy; Get-SafeAttachmentRule | Sort-Object Priority',
    links: [
      link('Microsoft Defender portal — Safe Attachments', `${DEFENDER}/safeattachmentv2`),
      link('Microsoft Defender portal — preset security policies', `${DEFENDER}/presetSecurityPolicies`),
    ],
  },
  {
    id: 'quarantine-policies',
    title: 'Quarantine policies',
    powershell: 'Get-QuarantinePolicy | Format-Table Name, EndUserQuarantinePermissions, ESNEnabled',
    links: [
      link('Microsoft Defender portal — quarantine policies', `${DEFENDER}/quarantinePolicies`),
      link('Microsoft Defender portal — quarantine', `${DEFENDER}/quarantine`),
    ],
  },
  {
    id: 'quarantine',
    title: 'Quarantine',
    powershell: 'Get-QuarantinePolicy | Format-Table Name, EndUserQuarantinePermissions',
    links: [
      link('Microsoft Defender portal — quarantine', `${DEFENDER}/quarantine`),
      link('Microsoft Defender portal — quarantine policies', `${DEFENDER}/quarantinePolicies`),
      link('Exchange admin center', `${EAC}/`),
    ],
  },
  {
    id: 'auth-policies',
    title: 'Authentication policies and SMTP AUTH',
    powershell: 'Get-AuthenticationPolicy; Get-OrganizationConfig | Format-List OAuth2ClientProfileEnabled, SmtpClientAuthenticationDisabled',
    links: [
      link('Exchange admin center — settings', `${EAC}/#/settings`),
      link('Microsoft Entra admin center — authentication methods', `${ENTRA}/#view/Microsoft_AAD_IAM/AuthenticationMethodsMenuBlade/~/AdminAuthMethods`),
      link('Microsoft 365 admin center — org settings, modern authentication', `${M365}/Adminportal/Home#/Settings/Services/:/Settings/L1/ModernAuthentication`),
    ],
  },
  {
    id: 'owa-mobile',
    title: 'Outlook on the web and mobile mailbox policies',
    powershell: 'Get-OwaMailboxPolicy; Get-MobileDeviceMailboxPolicy',
    links: [
      link('Exchange admin center — roles', `${EAC}/#/adminroles`),
    ],
  },
  {
    id: 'retention',
    title: 'Retention and mailbox policies',
    powershell: 'Get-RetentionPolicy; Get-Mailbox -Identity <user> | Format-List RetentionPolicy, LitigationHoldEnabled, RetentionHoldEnabled',
    links: [
      link('Microsoft Purview — data lifecycle policies', `${PURVIEW}/datalifecyclemanagement/retention`),
      link('Microsoft Purview — retention labels', `${PURVIEW}/datalifecyclemanagement/retentionlabels`),
      link('Microsoft 365 admin center — compliance shortcut', `${M365}/Adminportal/Home#/compliance`),
    ],
  },
  {
    id: 'groups',
    title: 'Distribution groups',
    powershell: 'Get-DistributionGroup | Format-Table DisplayName, PrimarySmtpAddress, RequireSenderAuthenticationEnabled',
    links: [
      link('Exchange admin center — groups', `${EAC}/#/groups`),
      link('Microsoft 365 admin center — groups', `${M365}/Adminportal/Home#/groups`),
      link('Microsoft Entra admin center — groups', `${ENTRA}/#view/Microsoft_AAD_IAM/GroupsManagementMenuBlade/~/AllGroups`),
    ],
  },
  {
    id: 'mailboxes',
    title: 'Mailboxes, shared and resource',
    powershell: 'Get-Mailbox -ResultSize 50 | Format-Table DisplayName, RecipientTypeDetails, PrimarySmtpAddress',
    links: [
      link('Exchange admin center — mailboxes', `${EAC}/#/mailboxes`),
      link('Microsoft 365 admin center — users', `${M365}/Adminportal/Home#/users`),
    ],
  },
  {
    id: 'resources',
    title: 'Room and equipment booking',
    powershell: 'Get-Mailbox -RecipientTypeDetails RoomMailbox,EquipmentMailbox | Get-CalendarProcessing | Format-List Identity, AutomateProcessing, AllBookInPolicy, BookInPolicy, ResourceDelegates, AllowConflicts',
    links: [
      link('Exchange admin center — resources', `${EAC}/#/resources`),
      link('Microsoft 365 admin center — rooms and equipment', `${M365}/Adminportal/Home#/ResourceMailbox`),
    ],
  },
  {
    id: 'contacts',
    title: 'Mail contacts and mail users',
    powershell: 'Get-MailContact | Format-Table DisplayName, ExternalEmailAddress, HiddenFromAddressListsEnabled\nGet-MailUser | Format-Table DisplayName, ExternalEmailAddress, RecipientTypeDetails',
    links: [
      link('Exchange admin center — contacts', `${EAC}/#/contacts`),
      link('Microsoft 365 admin center — contacts', `${M365}/Adminportal/Home#/contacts`),
    ],
  },
  {
    id: 'groups-m365',
    title: 'Microsoft 365 groups',
    powershell: 'Get-UnifiedGroup | Format-Table DisplayName, AccessType, GroupMemberCount, GroupExternalMemberCount',
    links: [
      link('Microsoft 365 admin center — active teams and groups', `${M365}/Adminportal/Home#/groups`),
      link('Exchange admin center — groups', `${EAC}/#/groups`),
      link('Microsoft Entra admin center — groups', `${ENTRA}/#view/Microsoft_AAD_IAM/GroupsManagementMenuBlade/~/AllGroups`),
    ],
  },
  {
    id: 'quarantine-messages',
    title: 'Quarantined messages',
    powershell: 'Get-QuarantineMessage -RecipientAddress <user> -StartReceivedDate (Get-Date).AddDays(-14) | Format-Table ReceivedTime, SenderAddress, Subject, QuarantineTypes, PolicyName, ReleaseStatus',
    links: [
      link('Microsoft Defender portal — quarantine', `${DEFENDER}/quarantine`),
      link('Microsoft Defender portal — Explorer (Plan 2) or real-time detections (Plan 1)', `${DEFENDER}/threatexplorerv3`),
      link('End-user quarantine (the recipient)', `${DEFENDER}/quarantine?viewid=Email`),
    ],
  },
  {
    id: 'delegation',
    title: 'Mailbox delegation',
    powershell: 'Get-MailboxPermission -Identity <user>; Get-RecipientPermission -Identity <user>; Get-Mailbox -Identity <user> | Format-List GrantSendOnBehalfTo',
    links: [
      link('Exchange admin center — mailbox delegation', `${EAC}/#/mailboxes`),
      link('Microsoft 365 admin center — user mail settings', `${M365}/Adminportal/Home#/users`),
    ],
  },
  {
    id: 'mobile-devices',
    title: 'Mobile devices on this mailbox',
    powershell: 'Get-MobileDevice -Mailbox <user> | Format-List FriendlyName, DeviceModel, DeviceOS, ClientType, DeviceAccessState, DeviceAccessStateReason, FirstSyncTime',
    links: [
      link('Exchange admin center — mailboxes (select the mailbox, then Mobile devices)', `${EAC}/#/mailboxes`),
      link('Exchange admin center — mobile device access', `${EAC}/#/mobiledeviceaccess`),
    ],
  },
  {
    id: 'folder-permissions',
    title: 'Calendar and folder permissions',
    powershell: 'Get-MailboxFolderPermission -Identity "<user>:\\Calendar"; Get-MailboxFolderStatistics -Identity <user> | Select-Object FolderPath, FolderType',
    links: [
      link('Outlook on the web — calendar sharing (as the mailbox owner)', 'https://outlook.office.com/calendar/options/calendar/SharedCalendars'),
      link('Exchange admin center — mailbox delegation', `${EAC}/#/mailboxes`),
    ],
  },
  {
    id: 'forwarding',
    title: 'Forwarding and inbox rules',
    powershell: 'Get-Mailbox -Identity <user> | Format-List ForwardingSmtpAddress, ForwardingAddress, DeliverToMailboxAndForward; Get-InboxRule -Mailbox <user>',
    links: [
      link('Exchange admin center — mailbox', `${EAC}/#/mailboxes`),
      link('Outlook on the web — inbox rules (the mailbox owner)', 'https://outlook.office.com/mail/options/mail/rules'),
      link('Microsoft Defender portal — outbound spam, automatic forwarding', `${DEFENDER}/antispam`),
    ],
  },
  {
    id: 'message-trace',
    title: 'Message trace',
    powershell: 'Get-MessageTraceV2 -SenderAddress <sender> -StartDate (Get-Date).AddDays(-2) -EndDate (Get-Date)',
    links: [
      link('Exchange admin center — message trace', `${EAC}/#/messagetrace`),
      link('Microsoft Defender portal — message trace', `${DEFENDER}/messagetrace`),
    ],
  },
  {
    id: 'service-health',
    title: 'Service health',
    powershell: 'Get-MgServiceAnnouncementHealthOverview',
    links: [
      link('Microsoft 365 admin center — service health', 'https://admin.cloud.microsoft/#/servicehealth'),
      link('Microsoft 365 admin center — message center', 'https://admin.cloud.microsoft/#/MessageCenter'),
    ],
  },
  {
    id: 'spf-dmarc',
    title: 'SPF, DMARC, MTA-STS and TLS-RPT',
    powershell: 'Resolve-DnsName -Type TXT contoso.com; Resolve-DnsName -Type TXT _dmarc.contoso.com',
    links: [
      link('Microsoft Defender portal — email authentication', `${DEFENDER}/authentication`),
      link('Microsoft 365 admin center — domains (DNS records)', `${M365}/Adminportal/Home#/Domains`),
    ],
  },
  {
    id: 'dlp',
    title: 'Data loss prevention',
    powershell: 'Get-DlpCompliancePolicy | Format-Table Name, Mode, Workload; Get-DlpComplianceRule | Format-Table Name, Policy, Mode',
    links: [
      link('Microsoft Purview — DLP policies', `${PURVIEW}/datalossprevention/policies`),
      link('Microsoft Defender portal — alert policies that can surface DLP', `${DEFENDER}/alertpoliciesv2`),
      link('Exchange admin center — mail flow (transport rules are separate)', `${EAC}/#/transportrules`),
    ],
  },
  {
    id: 'labels',
    title: 'Sensitivity labels',
    powershell: 'Get-Label | Format-Table Name, Priority; Get-LabelPolicy | Format-Table Name',
    links: [
      link('Microsoft Purview — sensitivity labels', `${PURVIEW}/informationprotection/informationprotectionlabels/sensitivitylabels`),
      link('Microsoft Purview — label policies', `${PURVIEW}/informationprotection/labelpolicies`),
      link('Microsoft Defender portal — email and collaboration', `${DEFENDER}/`),
    ],
  },
  {
    id: 'retention-purview',
    title: 'Retention policies and labels',
    powershell: 'Get-RetentionCompliancePolicy | Format-Table Name, Workload; Get-ComplianceTag | Format-Table Name',
    links: [
      link('Microsoft Purview — data lifecycle policies', `${PURVIEW}/datalifecyclemanagement/retention`),
      link('Microsoft Purview — retention labels', `${PURVIEW}/datalifecyclemanagement/retentionlabels`),
      link('Microsoft Purview — records management', `${PURVIEW}/recordsmanagement/fileplan`),
    ],
  },
  {
    id: 'ediscovery',
    title: 'eDiscovery cases and holds',
    powershell: 'Get-ComplianceCase | Format-Table Name, Status; Get-CaseHoldPolicy | Format-Table Name, Case',
    links: [
      link('Microsoft Purview — eDiscovery', `${PURVIEW}/ediscovery`),
      link('Microsoft Purview — content search', `${PURVIEW}/contentsearch`),
      link('Exchange admin center — mailbox litigation hold', `${EAC}/#/mailboxes`),
    ],
  },
  {
    id: 'audit',
    title: 'Audit log',
    powershell: 'Get-AdminAuditLogConfig | Format-List UnifiedAuditLogIngestionEnabled; Search-UnifiedAuditLog -StartDate (Get-Date).AddDays(-1) -EndDate (Get-Date) -ResultSize 50',
    links: [
      link('Microsoft Purview — audit', `${PURVIEW}/audit`),
      link('Microsoft Purview — audit retention', `${PURVIEW}/auditlogsearch`),
      link('Microsoft Entra admin center — audit logs', `${ENTRA}/#view/Microsoft_AAD_IAM/AuditLogList.ReactView`),
    ],
  },
  {
    id: 'compliance-admin',
    title: 'Purview role groups',
    powershell: 'Get-RoleGroup -ShowPartnerLinkedRoleGroups | Format-Table Name',
    links: [
      link('Microsoft Purview — permissions', `${PURVIEW}/permissions`),
      link('Microsoft Entra admin center — roles', `${ENTRA}/#view/Microsoft_AAD_IAM/RolesManagementMenuBlade/~/AllRoles`),
      link('Exchange admin center — admin roles', `${EAC}/#/adminroles`),
    ],
  },
  {
    id: 'migrations',
    title: 'Migrations',
    powershell: 'Get-MigrationEndpoint; Get-MigrationBatch; Get-MoveRequest -ResultSize 50',
    links: [
      link('Exchange admin center — migration', `${EAC}/#/migration`),
      link('Microsoft 365 admin center — migration', `${M365}/Adminportal/Home#/migrationservices`),
    ],
  },
  {
    id: 'user-roles',
    title: 'User roles (role assignment policies)',
    powershell: 'Get-RoleAssignmentPolicy | Format-List Name, IsDefault, AssignedRoles\nGet-Mailbox -ResultSize Unlimited | Group-Object RoleAssignmentPolicy | Format-Table Name, Count',
    links: [
      link('Exchange admin center — user roles', `${EAC}/#/userroles`),
      link('Microsoft Learn — role assignment policies', 'https://learn.microsoft.com/exchange/permissions-exo/role-assignment-policies'),
    ],
  },
  {
    id: 'role-assignments',
    title: 'Management role assignments and scopes',
    powershell: 'Get-ManagementRoleAssignment -ResultSize Unlimited | Format-Table Name, Role, RoleAssigneeName, RoleAssigneeType, RecipientWriteScope, CustomRecipientWriteScope, CustomResourceScope\nGet-ManagementScope | Format-Table Name, ScopeRestrictionType, RecipientFilter, Exclusive',
    links: [
      link('Exchange admin center — admin roles (each role group\'s Assigned roles and Write scope)', `${EAC}/#/adminroles`),
      link('Microsoft Learn — management role assignments', 'https://learn.microsoft.com/exchange/permissions-exo/permissions-exo'),
    ],
  },
  {
    id: 'app-rbac',
    title: 'RBAC for Applications',
    powershell: 'Get-ServicePrincipal | Format-Table DisplayName, AppId\nGet-ManagementRoleAssignment -RoleAssigneeType ServicePrincipal | Format-Table Role, RoleAssigneeName, CustomResourceScope\nGet-ApplicationAccessPolicy | Format-Table AppId, ScopeName, AccessRight',
    links: [
      link('Microsoft Entra admin center — enterprise applications', `${ENTRA}/#view/Microsoft_AAD_IAM/StartboardApplicationsMenuBlade/~/AppAppsPreview`),
      link('Microsoft Learn — Role Based Access Control for Applications in Exchange Online', 'https://learn.microsoft.com/exchange/permissions-exo/application-rbac'),
    ],
  },
  {
    id: 'admin-roles',
    title: 'Admin roles',
    powershell: 'Get-RoleGroup | Format-Table Name, Description, Members\nGet-MgDirectoryRole -ExpandProperty Members | Format-Table DisplayName',
    links: [
      link('Exchange admin center — admin roles', `${EAC}/#/adminroles`),
      link('Microsoft Entra admin center — roles and administrators', `${ENTRA}/#view/Microsoft_AAD_IAM/RolesManagementMenuBlade/~/AllRoles`),
      link('Microsoft Purview — permissions', `${PURVIEW}/permissions`),
      link('Microsoft Defender portal — permissions', `${DEFENDER}/permissions`),
    ],
  },
  {
    id: 'changes',
    title: 'Change history',
    powershell: 'Get-AdminAuditLogConfig | Format-List UnifiedAuditLogIngestionEnabled; Search-AdminAuditLog -StartDate (Get-Date).AddDays(-7) -EndDate (Get-Date) -ResultSize 50',
    links: [
      link('Microsoft Purview — audit search', `${PURVIEW}/audit`),
      link('Microsoft Entra admin center — audit logs', `${ENTRA}/#view/Microsoft_AAD_IAM/AuditLogList.ReactView`),
    ],
  },
  {
    id: 'support',
    title: 'Microsoft support',
    powershell: 'Get-MessageTraceV2 is the evidence to attach. Support cases are opened in the admin center, not by a Get- command.',
    links: [
      link('Microsoft 365 admin center — support requests', `${M365}/Adminportal/Home#/support`),
      link('Microsoft 365 admin center — service health (attach the incident)', `${M365}/Adminportal/Home#/servicehealth`),
      link('Microsoft Defender portal — incidents to quote in the case', `${DEFENDER}/incidents`),
    ],
  },
  {
    id: 'conditional-access',
    title: 'Conditional Access for Exchange',
    powershell: 'Get-MgIdentityConditionalAccessPolicy | Format-Table DisplayName, State',
    links: [
      link('Microsoft Entra admin center — Conditional Access', `${ENTRA}/#view/Microsoft_AAD_ConditionalAccess/ConditionalAccessBlade/~/Policies`),
      link('Exchange admin center — authentication policies (SMTP AUTH, a different control)', `${EAC}/#/authpolicies`),
      link('Microsoft 365 admin center', `${M365}/`),
    ],
  },
  {
    id: 'xdr',
    title: 'Defender XDR incidents and alerts',
    powershell: 'Get-MgSecurityIncident -Top 25; Get-MgSecurityAlert -Top 25',
    links: [
      link('Microsoft Defender portal — incidents', `${DEFENDER}/incidents`),
      link('Microsoft Defender portal — alerts', `${DEFENDER}/alerts`),
      link('Microsoft 365 admin center — support, if you need Microsoft to look', `${M365}/Adminportal/Home#/support`),
    ],
  },
  {
    id: 'user-account',
    title: 'User account and licenses',
    powershell: 'Get-MgUser -UserId <upn> -Property DisplayName, AccountEnabled, UsageLocation; Get-MgUserLicenseDetail -UserId <upn>',
    links: [
      link('Microsoft 365 admin center — active users', `${M365}/Adminportal/Home#/users`),
      link('Microsoft Entra admin center — users', `${ENTRA}/#view/Microsoft_AAD_UsersAndTenants/UserManagementMenuBlade/~/AllUsers`),
    ],
  },
  {
    id: 'anti-malware',
    title: 'Anti-malware policies',
    powershell: 'Get-MalwareFilterRule; Get-MalwareFilterPolicy | Format-List Name, EnableFileFilter, ZapEnabled, QuarantineTag',
    links: [
      link('Microsoft Defender portal — anti-malware', `${DEFENDER}/antimalwarev2`),
      link('Microsoft Defender portal — policies and rules', `${DEFENDER}/threatpolicy`),
    ],
  },
  {
    id: 'outbound-spam',
    title: 'Outbound spam and automatic forwarding',
    powershell: 'Get-HostedOutboundSpamFilterRule; Get-HostedOutboundSpamFilterPolicy | Format-List Name, AutoForwardingMode, RecipientLimitPerDay',
    links: [
      link('Microsoft Defender portal — anti-spam (outbound policy)', `${DEFENDER}/antispam`),
      link('Microsoft Defender portal — restricted entities (blocked senders)', `${DEFENDER}/restrictedentities`),
    ],
  },
  {
    id: 'preset-policies',
    title: 'Preset security policies (Standard, Strict, Built-in protection)',
    powershell: 'Get-EOPProtectionPolicyRule; Get-ATPProtectionPolicyRule; Get-ATPBuiltInProtectionRule',
    links: [
      link('Microsoft Defender portal — preset security policies', `${DEFENDER}/presetSecurityPolicies`),
      link('Microsoft Defender portal — policies and rules', `${DEFENDER}/threatpolicy`),
    ],
  },
  {
    id: 'signins',
    title: 'Sign-in logs',
    powershell: "Get-MgAuditLogSignIn -Filter \"userPrincipalName eq '<upn>'\" -Top 15",
    links: [
      link('Microsoft Entra admin center — sign-in logs', `${ENTRA}/#view/Microsoft_AAD_IAM/SignInLogsList.ReactView`),
      link('Microsoft Entra admin center — users (open the user, then Sign-in logs)', `${ENTRA}/#view/Microsoft_AAD_UsersAndTenants/UserManagementMenuBlade/~/AllUsers`),
    ],
  },
];

// Commands are written with <user> so they work for any mailbox. When a page has a mailbox open,
// put its address in so the command can be copied and run as is.
export function fillUser(command, address) {
  const value = String(address || '').trim();
  if (!value) return command;
  const safe = /^[A-Za-z0-9._%+@-]+$/.test(value) ? value : `'${value.replace(/'/g, "''")}'`;
  return String(command).replaceAll('<user>', safe);
}

export function portalsFor(id) {
  return PORTALS.find(p => p.id === id) || null;
}

// Organization > Service health. The tenant's own Microsoft 365 view first, then the status pages for the
// services mail flow depends on. Learn: microsoft-365/enterprise/view-service-health and
// azure/service-health/overview.
export const HEALTH_LINKS = {
  m365: 'https://admin.cloud.microsoft/#/servicehealth',
  messageCenter: 'https://admin.cloud.microsoft/#/MessageCenter',
};
export const HEALTH_SITES = [
  { name: 'Microsoft 365 status', url: 'https://status.cloud.microsoft', signIn: 'None', when: 'When you cannot sign in to the Microsoft 365 admin center, or Service health itself is down. Microsoft posts only outages that block admin center access here.' },
  { name: 'Azure status', url: 'https://azure.status.microsoft/en-us/status', signIn: 'None', when: 'Wide Azure outages across a region or several services. Exchange Online sign-in rides on Microsoft Entra ID, so a broad Azure or Entra incident can stop mail clients and PowerShell before mail flow itself.' },
  { name: 'Azure Service Health', url: 'https://portal.azure.com/#view/Microsoft_Azure_Health/AzureHealthBrowseBlade/~/serviceIssues', signIn: 'Azure subscription Reader or higher', when: 'Incidents and maintenance for the Azure resources you run that mail depends on, such as an Azure Static Web App hosting your MTA-STS policy, or a VM running an SMTP relay or hybrid server.' },
];
