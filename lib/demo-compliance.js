// Fictional Contoso compliance, migration, role, and audit rows. Not a real tenant.
const SALES = 'aaaaaaaa-0000-4000-8000-000000000010';

export const DEMO_COMPLIANCE = {
  source: 'demo',
  dlp: [
    { name: 'Credit card in email', mode: 'TestWithNotifications', workloads: ['Exchange', 'SharePoint'], scope: 'all', users: [], groups: [], rules: ['Credit card number, tip the sender'], distribution: 'Success' },
    { name: 'Sales confidential', mode: 'Enable', workloads: ['Exchange'], users: [], groups: [SALES, 'Sales'], rules: ['Block if the subject contains Confidential'], distribution: 'Pending' },
    { name: 'SharePoint only', mode: 'Enable', workloads: ['SharePoint'], users: [], groups: [], rules: ['Not an Exchange policy'] },
  ],
  dlpRules: [
    { name: 'Credit card number', policy: 'Credit card in email', mode: 'TestWithNotifications', blocks: false, notifyUser: ['SiteAdmin', 'LastModifier'], sensitiveTypes: ['Credit Card Number'], severity: 'Medium' },
    { name: 'Block confidential subject', policy: 'Sales confidential', mode: 'Enable', blocks: true, notifyUser: [], sensitiveTypes: [], severity: 'High' },
    { name: 'SharePoint credit card', policy: 'SharePoint only', mode: 'Enable' },
  ],
  labels: [
    { name: 'Public', priority: 0 },
    { name: 'Confidential', priority: 1 },
  ],
  labelPolicies: [
    { name: 'Publish default labels', labels: ['Public', 'Confidential'], publishedTo: 'All' },
  ],
  retentionPolicies: [
    { name: 'Mailbox 7 years', locations: ['Exchange'], scope: 'all', users: [], exclude: [], duration: '7 years' },
    { name: 'Executives longer', locations: ['Exchange'], users: ['adele.vance@contoso.com'], exclude: [], duration: '10 years' },
  ],
  retentionLabels: [
    { name: 'Finance 7 years', retention: '7 years', action: 'Keep' },
  ],
  cases: [
    { name: 'Project North', status: 'Active', holds: [{ name: 'North custodians', mailboxes: ['megan.bowen@contoso.com'] }] },
  ],
  audit: { enabled: true, retentionDays: '180 (demo). Advanced Audit, with longer retention, is an E5 capability.' },
  auditEvents: [
    { when: '2026-11-16T13:00:00Z', user: 'adele.vance@contoso.com', operation: 'Set-TransportRule', result: 'Success' },
  ],
  purviewRoles: [
    { name: 'Compliance Administrator', members: [{ displayName: 'Adele Vance' }] },
  ],
  entraRoles: [
    { name: 'Exchange Administrator', members: [{ displayName: 'Adele Vance' }] },
    { name: 'Compliance Administrator', members: [{ displayName: 'Adele Vance' }] },
  ],
  exchangeRoles: [
    { Name: 'Organization Management', Description: 'Members of this management role group have permissions to manage Exchange objects and their properties in the Exchange organization.', Roles: ['Mail Recipients', 'Transport Rules', 'Role Management', 'View-Only Configuration'], Members: ['Adele Vance'], ManagedBy: ['Organization Management'], WhenChanged: '2026-10-02T09:00:00Z' },
    { Name: 'View-Only Organization Management', Description: 'Members of this management role group can view recipient and configuration objects and their properties in the Exchange organization.', Roles: ['View-Only Configuration', 'View-Only Recipients'], Members: ['Megan Bowen'], ManagedBy: ['Organization Management'], WhenChanged: '2026-10-02T09:00:00Z' },
    { Name: 'Help Desk', Description: 'Members of this management role group can view and manage the configuration for individual recipients.', Roles: ['Reset Password', 'User Options', 'View-Only Recipients'], Members: [], ManagedBy: ['Organization Management'], WhenChanged: '2026-09-14T09:00:00Z' },
  ],
  userRoles: [
    { Name: 'Default Role Assignment Policy', Description: 'This policy grants end users the permission to set their options in Outlook on the web and perform other self-administration tasks.', IsDefault: true, AssignedRoles: ['MyBaseOptions', 'MyContactInformation', 'MyDistributionGroupMembership', 'MyRetentionPolicies', 'MyTextMessaging', 'MyVoiceMail', 'My Marketplace Apps', 'My Custom Apps', 'My ReadWriteMailbox Apps'], WhenChanged: '2026-09-01T09:00:00Z' },
    { Name: 'No add-ins', Description: 'Contractors: no add-in installs, no group creation.', IsDefault: false, AssignedRoles: ['MyBaseOptions', 'MyContactInformation', 'MyDistributionGroupMembership'], WhenChanged: '2026-11-03T09:00:00Z' },
  ],
  roleAssignments: [
    { Name: 'Mail Recipients-Organization Management', Role: 'Mail Recipients', RoleAssignee: 'Organization Management', RoleAssigneeType: 'RoleGroup', AssignmentMethod: 'Direct', RecipientWriteScope: 'Organization', CustomRecipientWriteScope: '', CustomResourceScope: '', Enabled: true },
    { Name: 'View-Only Recipients-View-Only Organization Management', Role: 'View-Only Recipients', RoleAssignee: 'View-Only Organization Management', RoleAssigneeType: 'RoleGroup', AssignmentMethod: 'Direct', RecipientWriteScope: 'Organization', CustomRecipientWriteScope: '', CustomResourceScope: '', Enabled: true },
    { Name: 'Reset Password-Help Desk', Role: 'Reset Password', RoleAssignee: 'Help Desk', RoleAssigneeType: 'RoleGroup', AssignmentMethod: 'Direct', RecipientWriteScope: 'Organization', CustomRecipientWriteScope: 'Sales users', CustomResourceScope: '', Enabled: true },
    { Name: 'MyBaseOptions-Default Role Assignment Policy', Role: 'MyBaseOptions', RoleAssignee: 'Default Role Assignment Policy', RoleAssigneeType: 'RoleAssignmentPolicy', AssignmentMethod: 'Direct', RecipientWriteScope: 'Self', CustomRecipientWriteScope: '', CustomResourceScope: '', Enabled: true },
    { Name: 'Application Mail.Read-Room booking app', Role: 'Application Mail.Read', RoleAssignee: 'Room booking app', RoleAssigneeType: 'ServicePrincipal', AssignmentMethod: 'Direct', RecipientWriteScope: '', CustomRecipientWriteScope: '', CustomResourceScope: 'Room mailboxes', Enabled: true },
  ],
  managementScopes: [
    { Name: 'Sales users', ScopeRestrictionType: 'RecipientScope', RecipientFilter: "Department -eq 'Sales'", RecipientRoot: '', Exclusive: false },
    { Name: 'Room mailboxes', ScopeRestrictionType: 'RecipientScope', RecipientFilter: "RecipientTypeDetails -eq 'RoomMailbox'", RecipientRoot: '', Exclusive: false },
  ],
  servicePrincipals: [
    { DisplayName: 'Room booking app', AppId: 'aaaaaaaa-0000-4000-8000-0000000000b1', ObjectId: 'aaaaaaaa-0000-4000-8000-0000000000b2' },
  ],
  appAccessPolicies: [
    { AppId: 'aaaaaaaa-0000-4000-8000-0000000000b3', ScopeName: 'Sales', AccessRight: 'RestrictAccess', Description: 'Legacy: CRM app limited to the Sales group.' },
  ],
  migrations: {
    endpoints: [{ name: 'Cutover endpoint', type: 'ExchangeOutlookAnywhere' }],
    batches: [{ name: 'Wave 1', status: 'Synced' }],
    moves: [{ mailbox: 'megan.bowen@contoso.com', status: 'Completed' }],
  },
  changes: [
    { when: '2026-11-16T13:00:00Z', caller: 'adele.vance@contoso.com', cmdlet: 'Set-TransportRule', object: 'Flag external spoof' },
  ],
  ca: [
    { name: 'Require MFA for Exchange', state: 'enabled', applications: ['00000002-0000-0ff1-ce00-000000000000'], includeUsers: ['All'], excludeUsers: [], includeGroups: [], grant: 'Require multifactor authentication' },
    { name: 'Block legacy auth', state: 'enabled', applications: ['Office 365'], includeUsers: [], includeGroups: [SALES], excludeUsers: [], grant: 'Block', clientAppTypes: ['exchangeActiveSync', 'other'] },
    { name: 'SharePoint unmanaged devices', state: 'enabled', applications: ['SharePoint'], includeUsers: ['All'], excludeUsers: [], includeGroups: [], grant: 'Block' },
  ],
  incidents: [
    { displayName: 'Suspicious mailbox rule', severity: 'medium', status: 'Active' },
  ],
  alerts: [
    { title: 'Mail-forwarding rule created', severity: 'medium', user: 'megan.bowen@contoso.com' },
  ],
};
