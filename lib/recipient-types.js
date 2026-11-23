// Single recipient: every kind of Exchange Online recipient that can receive email, and which
// Single recipient pages apply to it. Labels follow the Exchange admin center (Recipients > Mailboxes,
// Groups and Contacts). Pure, so the browser, the server and the tests share one answer.

// RecipientTypeDetails (Get-Recipient) -> the kind Ex360 works with and the label the admin center shows.
export const RECIPIENT_TYPES = {
  UserMailbox: { kind: 'mailbox', label: 'User mailbox' },
  SharedMailbox: { kind: 'mailbox', label: 'Shared mailbox' },
  RoomMailbox: { kind: 'mailbox', label: 'Room mailbox' },
  EquipmentMailbox: { kind: 'mailbox', label: 'Equipment mailbox' },
  SchedulingMailbox: { kind: 'mailbox', label: 'Scheduling mailbox' },
  LinkedMailbox: { kind: 'mailbox', label: 'Linked mailbox' },
  GroupMailbox: { kind: 'm365group', label: 'Microsoft 365 group' },
  MailUniversalDistributionGroup: { kind: 'group', label: 'Distribution list' },
  MailUniversalSecurityGroup: { kind: 'group', label: 'Mail-enabled security group' },
  RoomList: { kind: 'group', label: 'Room list' },
  DynamicDistributionGroup: { kind: 'group', label: 'Dynamic distribution list' },
  MailContact: { kind: 'contact', label: 'Mail contact' },
  MailUser: { kind: 'mailuser', label: 'Mail user' },
  GuestMailUser: { kind: 'mailuser', label: 'Guest mail user' },
  MailNonUniversalGroup: { kind: 'group', label: 'Distribution list (non-universal)' },
  PublicFolder: { kind: 'publicfolder', label: 'Mail-enabled public folder' },
};

export const KIND_WORDS = {
  mailbox: 'mailbox',
  m365group: 'Microsoft 365 group',
  group: 'distribution or mail-enabled security group',
  contact: 'mail contact',
  mailuser: 'mail user',
  publicfolder: 'mail-enabled public folder',
};

export function recipientType(typeDetails) {
  const known = RECIPIENT_TYPES[typeDetails];
  if (known) return { type: typeDetails, ...known };
  // Graph alone (before Exchange answers) only knows "a user"; treat it as a mailbox until Exchange says otherwise.
  return { type: typeDetails || 'User', kind: 'mailbox', label: typeDetails && typeDetails !== 'User' ? typeDetails : 'User' };
}

// Graph objects from the recipient search, labelled the way the admin center labels them.
export function graphGroupType(group) {
  const types = group?.groupTypes || [];
  if (types.includes('Unified')) return 'GroupMailbox';
  if (types.includes('DynamicMembership')) return 'DynamicDistributionGroup';
  if (group?.securityEnabled) return 'MailUniversalSecurityGroup';
  return 'MailUniversalDistributionGroup';
}

const ALL = ['mailbox', 'm365group', 'group', 'contact', 'mailuser', 'publicfolder'];
const why = {
  noMailbox: k => `A ${KIND_WORDS[k]} has no mailbox of its own in Exchange Online, so there is nothing here to show.`,
  noSignIn: k => `A ${KIND_WORDS[k]} is not an account that signs in, so there are no sign-ins or Conditional Access policies for it.`,
};

// Each Single recipient page: which kinds it applies to, and the plain reason when it does not.
export const PAGE_SCOPE = {
  'mb-recipient': { kinds: ALL },
  'mb-forward': { kinds: ['mailbox'], reason: k => (k === 'publicfolder' ? 'A mail-enabled public folder has no inbox rules. Its forwarding address, if it has one, is shown on Recipient.' : k === 'contact' || k === 'mailuser' ? `A ${KIND_WORDS[k]} has no mailbox here. Mail to it always goes to its external address, shown on Recipient.` : `A ${KIND_WORDS[k]} has no forwarding setting or inbox rules. Mail to it goes to its members; a mail flow rule is the only way to redirect it.`) },
  'mb-rules': { kinds: ['mailbox'], reason: k => (k === 'm365group' ? 'A Microsoft 365 group mailbox has no inbox rules. Use a mail flow rule to act on mail sent to the group.' : why.noMailbox(k)) },
  'mb-delegation': { kinds: ['mailbox', 'm365group', 'group', 'mailuser', 'publicfolder'], reason: () => 'A mail contact only points to an outside address. Nobody can open it, send as it or send on its behalf.' },
  'mb-groups': { kinds: ALL },
  'mb-policies': { kinds: ALL },
  'mb-protocols': { kinds: ['mailbox'], reason: k => `Client protocols (Outlook, ActiveSync, POP, IMAP, SMTP AUTH) belong to a mailbox someone signs in to. A ${KIND_WORDS[k]} has none.` },
  'mb-signins': { kinds: ['mailbox', 'mailuser'], reason: k => why.noSignIn(k) },
  'mb-findings': { kinds: ALL },
  'mb-compliance': { kinds: ['mailbox', 'm365group'], reason: k => (k === 'publicfolder' ? 'Ex360 reads DLP, retention and holds for mailboxes and Microsoft 365 groups. Public folder content is covered by the organization-wide Compliance pages.' : `DLP, retention and holds act on content stored in a mailbox. A ${KIND_WORDS[k]} stores no mail in Exchange Online.`) },
  'mb-ca': { kinds: ['mailbox', 'mailuser'], reason: k => why.noSignIn(k) },
  'mb-xdr': { kinds: ['mailbox', 'm365group', 'mailuser'], reason: k => `Defender XDR alerts name a mailbox or an account. A ${KIND_WORDS[k]} is neither, so alerts about mail sent to it appear on ${k === 'contact' || k === 'publicfolder' ? 'the sender or the organization-wide Defender XDR pages' : 'its members\' mailboxes'}.` },
};

// The full mailbox read (the PDF report and the report parts on Recipient, Inbox rules, Policies that apply
// and Findings) covers user, shared, room and equipment mailboxes.
export function reportApplies(kind) {
  return !kind || kind === 'mailbox';
}

export function pageApplies(pageId, kind) {
  const scope = PAGE_SCOPE[pageId];
  if (!scope || !kind) return { applies: true };
  if (scope.kinds.includes(kind)) return { applies: true };
  return { applies: false, reason: scope.reason ? scope.reason(kind) : `This page does not apply to a ${KIND_WORDS[kind] || kind}.` };
}
