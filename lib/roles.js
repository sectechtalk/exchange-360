// Exchange-related roles in plain words: Admin roles, User roles, Role assignments and scopes, App access.
// Pure, so the page and the tests share one answer.

// User roles (role assignment policies): what each end-user role lets a person change themselves.
export const USER_ROLE_WORDS = {
  MyBaseOptions: 'Their own mailbox settings in Outlook on the web: rules, automatic replies, junk email and so on.',
  MyContactInformation: 'Their own contact details: address and phone numbers.',
  MyAddressInformation: 'Their own mailing address, work phone and fax number.',
  MyMobileInformation: 'Their own mobile and pager numbers.',
  MyPersonalInformation: 'Their own home phone and web page.',
  MyMailboxDelegation: 'Give other people access to their mailbox (delegate permissions).',
  MyProfileInformation: 'Their own name fields.',
  MyDistributionGroups: 'Create, change and delete distribution groups they own.',
  MyDistributionGroupMembership: 'Join and leave distribution groups that allow it.',
  MyRetentionPolicies: 'Choose personal retention tags on their own items.',
  MyTextMessaging: 'Text message notifications.',
  MyVoiceMail: 'Their voicemail settings.',
  'My Marketplace Apps': 'Install add-ins from the Office Store.',
  'My Custom Apps': 'Install custom add-ins from a file or URL.',
  'My ReadWriteMailbox Apps': 'Install add-ins that can read and change their mailbox.',
  MyMailSubscriptions: 'Connected accounts (POP or IMAP subscriptions to other mailboxes).',
  MyTeamMailboxes: 'Site mailboxes.',
};

export function userRoleWords(role) {
  const name = String(role || '').replace(/^.*\\/, '');
  return USER_ROLE_WORDS[name] || 'An end-user role. See Get-ManagementRole for the cmdlets it allows.';
}

// Microsoft Entra roles that reach Exchange Online, with what each one means there.
export const ENTRA_EXCHANGE_ROLES = {
  'Global Administrator': 'Full control of Exchange Online, as a member of Organization Management.',
  'Exchange Administrator': 'Full control of Exchange Online, as a member of Organization Management.',
  'Exchange Recipient Administrator': 'Creates and changes mailboxes, groups and contacts (Recipient Management).',
  'Global Reader': 'Reads all Exchange Online settings (View-Only Organization Management).',
  'Security Administrator': 'Manages Defender for Office 365 email policies and quarantine.',
  'Security Reader': 'Reads Defender for Office 365 email policies, alerts and quarantine.',
  'Security Operator': 'Responds to email threats: quarantine and investigations.',
  'Compliance Administrator': 'Manages Purview compliance features for email: DLP, retention, eDiscovery and audit.',
  'Compliance Data Administrator': 'Manages Purview compliance data and policies for email.',
  'Helpdesk Administrator': 'Resets passwords; Exchange access through Help Desk role group only.',
  'Reports Reader': 'Reads email usage reports.',
  'Message Center Reader': 'Reads Message center posts about Exchange Online.',
  'Service Support Administrator': 'Opens support requests and reads service health for Exchange Online.',
};

export function entraExchangeRoles(roles) {
  if (!Array.isArray(roles)) return roles;
  return roles
    .map(r => ({ name: r.displayName || r.name || '', members: r.members || [], means: ENTRA_EXCHANGE_ROLES[r.displayName || r.name] }))
    .filter(r => r.means)
    .sort((a, b) => Object.keys(ENTRA_EXCHANGE_ROLES).indexOf(a.name) - Object.keys(ENTRA_EXCHANGE_ROLES).indexOf(b.name));
}

// Get-ManagementRoleAssignment rows: who holds which role, over which recipients.
export function assignmentScope(a) {
  return a.CustomResourceScope || a.CustomRecipientWriteScope || a.RecipientWriteScope || 'Organization';
}

export function splitAssignments(rows) {
  if (!Array.isArray(rows)) return { admin: rows, user: rows, app: rows, direct: rows };
  const kind = a => String(a.RoleAssigneeType || '');
  return {
    admin: rows.filter(a => kind(a) === 'RoleGroup'),
    user: rows.filter(a => kind(a) === 'RoleAssignmentPolicy'),
    app: rows.filter(a => kind(a) === 'ServicePrincipal'),
    direct: rows.filter(a => !['RoleGroup', 'RoleAssignmentPolicy', 'ServicePrincipal'].includes(kind(a))),
  };
}

export function names(list) {
  return (Array.isArray(list) ? list : list == null || list === '' ? [] : [list])
    .map(m => (typeof m === 'object' ? m.displayName || m.Name || m.name || m.userPrincipalName || '' : String(m)))
    .filter(Boolean);
}
