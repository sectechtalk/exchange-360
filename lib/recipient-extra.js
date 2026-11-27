// Single recipient pages added on 2026-11-26: Mobile devices, Calendar and folder permissions, Admin changes,
// and Licenses and service plans. Shaping of the raw reads (Exchange Online PowerShell and Microsoft Graph)
// into the rows each page shows, plus the Contoso demo rows. Everything here is a read.
import { SERVICE_PLANS, skuDisplayName } from './licenses.js';

export const EXTRA_KINDS = ['devices', 'folders', 'audit', 'licenses'];
export const AUDIT_DAYS = 90;
export const FOLDER_LIMIT = 60;

const arr = v => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]);
const str = v => (v == null ? '' : String(v));

// Get-MobileDevice -Mailbox <id>. Exchange admin center > Mailboxes > a mailbox > Mobile devices.
export function deviceRows(raw) {
  return arr(raw).map(d => ({
    name: str(d.FriendlyName) || str(d.DeviceModel) || str(d.DeviceId) || 'Unknown device',
    deviceId: str(d.DeviceId),
    model: str(d.DeviceModel),
    os: str(d.DeviceOS),
    type: str(d.DeviceType),
    app: str(d.ClientType),
    access: str(d.DeviceAccessState),
    reason: str(d.DeviceAccessStateReason),
    firstSync: str(d.FirstSyncTime),
    changed: str(d.WhenChanged),
  }));
}

// Get-MailboxFolderPermission on each folder. "Default" and "Anonymous" with None are how every folder starts,
// so they are hidden unless the folder is the Calendar (where people look for them).
export function folderRows(raw) {
  return arr(raw).map(r => ({
    folder: str(r.Folder) || str(r.FolderName) || 'Top of Information Store',
    folderType: str(r.FolderType),
    user: str(r.User),
    rights: arr(r.AccessRights).map(str).join(', ') || 'None',
    flags: arr(r.SharingPermissionFlags).map(str).filter(Boolean).join(', '),
  }));
}
export function sharedFolders(rows) {
  return rows.filter(r => r.folderType === 'Calendar' || !(/^(Default|Anonymous)$/i.test(r.user) && /^None$/i.test(r.rights)));
}
export function folderSummary(rows) {
  const shared = rows.filter(r => !/^(Default|Anonymous)$/i.test(r.user) && !/^None$/i.test(r.rights));
  const people = new Set(shared.map(r => r.user));
  const folders = new Set(shared.map(r => r.folder));
  const cal = rows.find(r => r.folderType === 'Calendar' && /^Default$/i.test(r.user));
  return { people: people.size, folders: folders.size, calendarDefault: cal ? cal.rights : '' };
}

// Search-AdminAuditLog -ObjectIds <id>, last 90 days: changes Exchange admins made to this recipient.
export function auditRows(raw) {
  return arr(raw).map(r => ({
    when: str(r.RunDate),
    who: str(r.Caller),
    cmdlet: str(r.CmdletName),
    object: str(r.ObjectModified),
    succeeded: r.Succeeded === false ? 'No' : 'Yes',
    parameters: arr(r.Parameters).map(str).join('; '),
  })).sort((a, b) => Date.parse(b.when || 0) - Date.parse(a.when || 0));
}
// Microsoft Graph directoryAudits that targeted this user: Entra changes (licenses, groups, passwords, roles).
export function directoryRows(raw) {
  return arr(raw).map(r => ({
    when: str(r.activityDateTime),
    who: r.initiatedBy?.user?.userPrincipalName || r.initiatedBy?.app?.displayName || '',
    activity: str(r.activityDisplayName),
    category: str(r.category),
    result: str(r.result),
    service: str(r.loggedByService),
  }));
}

// Graph /users/{id}/licenseDetails plus the user's licenseAssignmentStates: each license, how it was
// assigned (directly or through a group), and every service plan in it with its status.
export function licenseRows(details, states = [], groupNames = {}) {
  return arr(details).map(d => {
    const how = arr(states).filter(s => s.skuId === d.skuId);
    const assigned = how.length
      ? how.map(s => (s.assignedByGroup ? `Group: ${groupNames[s.assignedByGroup] || s.assignedByGroup}` : 'Direct')).join(', ')
      : 'Direct';
    const errors = how.map(s => s.error).filter(e => e && e !== 'None');
    return {
      skuId: str(d.skuId),
      part: str(d.skuPartNumber),
      name: skuDisplayName(d.skuPartNumber),
      assigned,
      error: errors.join(', '),
      plans: arr(d.servicePlans).map(p => ({
        id: str(p.servicePlanId),
        part: str(p.servicePlanName),
        name: SERVICE_PLANS[p.servicePlanName]?.name || str(p.servicePlanName),
        status: str(p.provisioningStatus),
        appliesTo: str(p.appliesTo),
        email: Boolean(SERVICE_PLANS[p.servicePlanName]) || /EXCHANGE|ATP|THREAT|PURVIEW|INFORMATION_PROTECTION|MIP|RMS|EOP/i.test(p.servicePlanName || ''),
      })),
    };
  });
}
export const PLAN_STATUS_WORDS = {
  Success: 'On',
  Disabled: 'Turned off for this user',
  PendingInput: 'Waiting: usually a missing usage location',
  PendingActivation: 'Being turned on',
  PendingProvisioning: 'Being set up',
  Error: 'Failed',
};

// ---- Contoso demo rows (fictional), keyed by mailbox address.
const DEMO_DEVICES = {
  'megan.bowen@contoso.com': [
    { FriendlyName: "Megan's iPhone", DeviceId: 'A1B2C3D4E5', DeviceModel: 'iPhone', DeviceOS: 'iOS 19.1', DeviceType: 'Outlook', ClientType: 'Outlook', DeviceAccessState: 'Allowed', DeviceAccessStateReason: 'Global', FirstSyncTime: '2026-03-02T15:00:00Z', WhenChanged: '2026-11-20T08:10:00Z' },
    { FriendlyName: 'Pixel 9', DeviceId: 'ANDROIDC0FFEE01', DeviceModel: 'Pixel 9', DeviceOS: 'Android 16', DeviceType: 'Android', ClientType: 'EAS', DeviceAccessState: 'Quarantined', DeviceAccessStateReason: 'DeviceRule', FirstSyncTime: '2026-11-18T19:42:00Z', WhenChanged: '2026-11-18T19:42:00Z' },
  ],
};
const DEMO_FOLDERS = {
  'megan.bowen@contoso.com': [
    { Folder: 'Calendar', FolderType: 'Calendar', User: 'Default', AccessRights: ['AvailabilityOnly'] },
    { Folder: 'Calendar', FolderType: 'Calendar', User: 'Anonymous', AccessRights: ['None'] },
    { Folder: 'Calendar', FolderType: 'Calendar', User: 'Adele Vance', AccessRights: ['Editor'], SharingPermissionFlags: ['Delegate'] },
    { Folder: 'Inbox', FolderType: 'Inbox', User: 'Default', AccessRights: ['None'] },
    { Folder: 'Inbox', FolderType: 'Inbox', User: 'Adele Vance', AccessRights: ['Reviewer'] },
    { Folder: 'Contacts', FolderType: 'Contacts', User: 'Default', AccessRights: ['None'] },
    { Folder: 'Projects\\Falcon', FolderType: 'User Created', User: 'Alex Wilber', AccessRights: ['Author'] },
  ],
};
const DEMO_AUDIT = {
  'megan.bowen@contoso.com': [
    { RunDate: '2026-11-19T17:05:00Z', Caller: 'admin@contoso.com', CmdletName: 'Set-Mailbox', ObjectModified: 'Megan Bowen', Succeeded: true, Parameters: ['ForwardingSmtpAddress=smtp:megan.personal@outlook.com', 'DeliverToMailboxAndForward=True'] },
    { RunDate: '2026-11-12T09:30:00Z', Caller: 'helpdesk@contoso.com', CmdletName: 'Add-MailboxPermission', ObjectModified: 'Megan Bowen', Succeeded: true, Parameters: ['User=Adele Vance', 'AccessRights=FullAccess'] },
    { RunDate: '2026-10-30T14:12:00Z', Caller: 'admin@contoso.com', CmdletName: 'Set-CASMailbox', ObjectModified: 'Megan Bowen', Succeeded: true, Parameters: ['PopEnabled=False'] },
  ],
};
const DEMO_DIRECTORY = {
  'megan.bowen@contoso.com': [
    { activityDateTime: '2026-11-15T10:00:00Z', activityDisplayName: 'Change user license', category: 'UserManagement', result: 'success', loggedByService: 'Core Directory', initiatedBy: { user: { userPrincipalName: 'admin@contoso.com' } } },
    { activityDateTime: '2026-11-02T16:20:00Z', activityDisplayName: 'Add member to group', category: 'GroupManagement', result: 'success', loggedByService: 'Core Directory', initiatedBy: { user: { userPrincipalName: 'admin@contoso.com' } } },
  ],
};
const E5 = 'aaaaaaaa-0000-4000-8000-000000000001';
const DEMO_LICENSES = {
  'megan.bowen@contoso.com': {
    details: [{ skuId: E5, skuPartNumber: 'SPE_E5', servicePlans: [
      { servicePlanName: 'EXCHANGE_S_ENTERPRISE', provisioningStatus: 'Success', appliesTo: 'User' },
      { servicePlanName: 'THREAT_INTELLIGENCE', provisioningStatus: 'Success', appliesTo: 'User' },
      { servicePlanName: 'PURVIEW_E5', provisioningStatus: 'Success', appliesTo: 'User' },
      { servicePlanName: 'TEAMS1', provisioningStatus: 'Disabled', appliesTo: 'User' },
      { servicePlanName: 'SHAREPOINTENTERPRISE', provisioningStatus: 'Success', appliesTo: 'User' },
    ] }],
    states: [{ skuId: E5, assignedByGroup: null, state: 'Active', error: 'None' }],
  },
};

export function demoExtra(what, address) {
  const key = str(address).toLowerCase();
  if (what === 'devices') return { ok: true, source: 'demo', value: deviceRows(DEMO_DEVICES[key] || []) };
  if (what === 'folders') return { ok: true, source: 'demo', value: folderRows(DEMO_FOLDERS[key] || [{ Folder: 'Calendar', FolderType: 'Calendar', User: 'Default', AccessRights: ['AvailabilityOnly'] }]) };
  if (what === 'audit') return { ok: true, source: 'demo', days: AUDIT_DAYS, exchange: { ok: true, value: auditRows(DEMO_AUDIT[key] || []) }, directory: { ok: true, value: directoryRows(DEMO_DIRECTORY[key] || []) } };
  if (what === 'licenses') { const l = DEMO_LICENSES[key]; return { ok: true, source: 'demo', value: l ? licenseRows(l.details, l.states) : [] }; }
  return { ok: false, message: 'Unknown read.' };
}
