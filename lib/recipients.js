// Organization-wide recipients: shared, room and equipment mailboxes, distribution and Microsoft 365 groups,
// and mailboxes that forward. Shaped from the Exchange Online `recipients` read, live or demo.
import { settingsFrom } from './org-settings.js';

export const RECIPIENT_READS = ['shared', 'resources', 'forwarding', 'counts', 'groups', 'dynamic', 'm365'];

export function shapeRecipients(bundle) {
  const { settings, errors, denied } = settingsFrom(bundle, RECIPIENT_READS);
  return { ...Object.fromEntries(RECIPIENT_READS.map(n => [n, settings[n] || []])), errors, denied };
}

// Plain-words description of a room or equipment mailbox's booking rules.
export function bookingWords(cal) {
  if (!cal) return 'Booking settings were not read.';
  const who = cal.AllBookInPolicy === true || cal.AllBookInPolicy === 'True' ? 'anyone in the organization' : (cal.BookInPolicy || []).length ? (cal.BookInPolicy || []).join(', ') : 'nobody directly';
  const auto = /autoaccept/i.test(cal.AutomateProcessing || '') ? 'Requests are accepted or declined automatically.' : /autoupdate/i.test(cal.AutomateProcessing || '') ? 'Requests are only marked tentative; a delegate must accept them.' : 'Requests are not processed automatically.';
  const parts = [`${auto} ${who === 'nobody directly' ? 'Nobody can book directly.' : `Who can book: ${who}.`}`];
  if ((cal.ResourceDelegates || []).length) parts.push(`Delegates: ${cal.ResourceDelegates.join(', ')}.`);
  if (cal.AllowConflicts === true) parts.push('Double booking is allowed.');
  if (cal.BookingWindowInDays != null) parts.push(`Bookable up to ${cal.BookingWindowInDays} days ahead, for up to ${Math.round(Number(cal.MaximumDurationInMinutes || 0) / 60)} hours.`);
  if (cal.AllowRecurringMeetings === false) parts.push('Recurring meetings are declined.');
  if (cal.ProcessExternalMeetingMessages === true) parts.push('Requests from outside the organization are processed.');
  return parts.join(' ');
}

const ok = (name, value) => ({ ok: true, name, value });

export function demoRecipientsBundle() {
  return {
    ok: true, mode: 'recipients', commands: [
      ok('shared', [
        { DisplayName: 'Sales', PrimarySmtpAddress: 'sales@contoso.com', RecipientTypeDetails: 'SharedMailbox', ArchiveStatus: 'None', WhenChanged: '2026-11-02T16:20:00Z', ExternalDirectoryObjectId: 'aaaaaaaa-0000-4000-8000-000000000004', ForwardingSmtpAddress: null, ForwardingAddress: '', MessageCopyForSentAsEnabled: true, MessageCopyForSendOnBehalfEnabled: false, HiddenFromAddressListsEnabled: false, LitigationHoldEnabled: false, GrantSendOnBehalfTo: [], FullAccessCount: 2, AccountEnabled: false },
        { DisplayName: 'Old Projects', PrimarySmtpAddress: 'projects@contoso.com', RecipientTypeDetails: 'SharedMailbox', ArchiveStatus: 'Active', WhenChanged: '2026-06-14T09:05:00Z', ExternalDirectoryObjectId: 'aaaaaaaa-0000-4000-8000-000000000005', ForwardingSmtpAddress: null, ForwardingAddress: '', MessageCopyForSentAsEnabled: false, MessageCopyForSendOnBehalfEnabled: false, HiddenFromAddressListsEnabled: true, LitigationHoldEnabled: false, GrantSendOnBehalfTo: [], FullAccessCount: 0, AccountEnabled: true },
      ]),
      ok('resources', [
        { DisplayName: 'Conference Room 1', PrimarySmtpAddress: 'room1@contoso.com', ExternalDirectoryObjectId: 'aaaaaaaa-0000-4000-8000-000000000011', RecipientTypeDetails: 'RoomMailbox', ResourceCapacity: 8, Office: 'Building 1', Calendar: { AutomateProcessing: 'AutoAccept', AllBookInPolicy: false, AllRequestInPolicy: false, BookInPolicy: ['sales-team@contoso.com'], ResourceDelegates: [], AllowConflicts: false, BookingWindowInDays: 180, MaximumDurationInMinutes: 1440, AllowRecurringMeetings: true, DeleteSubject: true, AddOrganizerToSubject: true, ProcessExternalMeetingMessages: false } },
        { DisplayName: 'Board Room', PrimarySmtpAddress: 'boardroom@contoso.com', ExternalDirectoryObjectId: 'aaaaaaaa-0000-4000-8000-000000000012', RecipientTypeDetails: 'RoomMailbox', ResourceCapacity: 20, Office: 'Building 1', Calendar: { AutomateProcessing: 'AutoUpdate', AllBookInPolicy: false, AllRequestInPolicy: false, BookInPolicy: [], ResourceDelegates: [], AllowConflicts: false, BookingWindowInDays: 180, MaximumDurationInMinutes: 1440, AllowRecurringMeetings: true, ProcessExternalMeetingMessages: false } },
        { DisplayName: 'Projector 2', PrimarySmtpAddress: 'projector2@contoso.com', ExternalDirectoryObjectId: 'aaaaaaaa-0000-4000-8000-000000000013', RecipientTypeDetails: 'EquipmentMailbox', Calendar: { AutomateProcessing: 'AutoAccept', AllBookInPolicy: true, BookInPolicy: [], ResourceDelegates: [], AllowConflicts: true, BookingWindowInDays: 30, MaximumDurationInMinutes: 480, AllowRecurringMeetings: false } },
      ]),
      ok('forwarding', [{ DisplayName: 'Megan Bowen', PrimarySmtpAddress: 'megan.bowen@contoso.com', RecipientTypeDetails: 'UserMailbox', ForwardingSmtpAddress: 'smtp:megan.bowen@northwind.example', ForwardingAddress: '', DeliverToMailboxAndForward: false }]),
      ok('counts', [{ Name: 'UserMailbox', Count: 2 }, { Name: 'SharedMailbox', Count: 2 }, { Name: 'RoomMailbox', Count: 2 }, { Name: 'EquipmentMailbox', Count: 1 }]),
      ok('groups', [
        { DisplayName: 'Sales team', PrimarySmtpAddress: 'sales-team@contoso.com', WhenCreated: '2025-03-10T12:00:00Z', ExternalDirectoryObjectId: 'aaaaaaaa-0000-4000-8000-000000000014', RecipientTypeDetails: 'MailUniversalDistributionGroup', ManagedBy: ['Adele Vance'], RequireSenderAuthenticationEnabled: true, AcceptOnlyFromCount: 0, ModerationEnabled: false, ModeratedBy: [], MemberJoinRestriction: 'Closed', MemberDepartRestriction: 'Closed', HiddenFromAddressListsEnabled: false, IsDirSynced: false, MemberCount: 2 },
        { DisplayName: 'All Contoso', PrimarySmtpAddress: 'everyone@contoso.com', WhenCreated: '2024-01-05T12:00:00Z', ExternalDirectoryObjectId: 'aaaaaaaa-0000-4000-8000-000000000015', RecipientTypeDetails: 'MailUniversalDistributionGroup', ManagedBy: [], RequireSenderAuthenticationEnabled: false, AcceptOnlyFromCount: 0, ModerationEnabled: false, ModeratedBy: [], MemberJoinRestriction: 'Closed', MemberDepartRestriction: 'Closed', HiddenFromAddressListsEnabled: false, IsDirSynced: false, MemberCount: 120 },
        { DisplayName: 'Finance security', PrimarySmtpAddress: 'finance-sec@contoso.com', WhenCreated: '2025-08-21T12:00:00Z', ExternalDirectoryObjectId: 'aaaaaaaa-0000-4000-8000-000000000016', RecipientTypeDetails: 'MailUniversalSecurityGroup', ManagedBy: ['Megan Bowen'], RequireSenderAuthenticationEnabled: true, ModerationEnabled: true, ModeratedBy: ['Megan Bowen'], MemberJoinRestriction: 'ApprovalRequired', MemberCount: 4 },
      ]),
      ok('dynamic', [{ DisplayName: 'Seattle staff', PrimarySmtpAddress: 'seattle@contoso.com', IsDirSynced: false, WhenCreated: '2025-11-01T12:00:00Z', RecipientFilter: "((City -eq 'Seattle') -and (RecipientType -eq 'UserMailbox'))", RequireSenderAuthenticationEnabled: true, ManagedBy: [] }]),
      ok('m365', [
        { DisplayName: 'Project North', PrimarySmtpAddress: 'projectnorth@contoso.com', ResourceProvisioningOptions: ['Team'], IsMembershipDynamic: false, WhenCreated: '2026-02-11T12:00:00Z', ExternalDirectoryObjectId: 'aaaaaaaa-0000-4000-8000-000000000017', AccessType: 'Private', ManagedBy: ['Megan Bowen'], GroupMemberCount: 5, GroupExternalMemberCount: 1, RequireSenderAuthenticationEnabled: true, HiddenFromExchangeClientsEnabled: false, AutoSubscribeNewMembers: false },
        { DisplayName: 'Social Club', PrimarySmtpAddress: 'social@contoso.com', ResourceProvisioningOptions: [], IsMembershipDynamic: false, WhenCreated: '2025-05-30T12:00:00Z', ExternalDirectoryObjectId: 'aaaaaaaa-0000-4000-8000-000000000018', AccessType: 'Public', ManagedBy: ['Adele Vance'], GroupMemberCount: 40, GroupExternalMemberCount: 0, RequireSenderAuthenticationEnabled: true, HiddenFromExchangeClientsEnabled: false, AutoSubscribeNewMembers: false },
      ]),
    ],
  };
}

// Design rule: recipient and group lists stay empty until a search runs. An empty search lists
// everything; otherwise rows whose display name or address contains the text are shown.
export function matchesRecipient(row, q) {
  const text = String(q || '').trim().toLowerCase();
  if (!text) return true;
  return [row?.DisplayName, row?.PrimarySmtpAddress, row?.Name].some(v => String(v || '').toLowerCase().includes(text));
}
