// Fictional Contoso tenant. Nothing here is a real customer. GUIDs are documentation values
// listed in tools/export.json allowGuids so the public export can keep them.
const MEGAN = 'aaaaaaaa-0000-4000-8000-000000000001';
const ADELE = 'aaaaaaaa-0000-4000-8000-000000000002';
const ROOM = 'aaaaaaaa-0000-4000-8000-000000000003';
const SALES = 'aaaaaaaa-0000-4000-8000-000000000004';
const GROUP = 'aaaaaaaa-0000-4000-8000-000000000010';
const MARKETING = 'aaaaaaaa-0000-4000-8000-000000000030';
const ALLSTAFF = 'aaaaaaaa-0000-4000-8000-000000000031';
const CONTACT = 'aaaaaaaa-0000-4000-8000-000000000032';
const MAILUSER = 'aaaaaaaa-0000-4000-8000-000000000033';

export const DEMO_MAILBOXES = [
  {
    id: MEGAN,
    displayName: 'Megan Bowen',
    primary: 'megan.bowen@contoso.com',
    type: 'UserMailbox',
    size: '4.2 GB',
    quota: '100 GB',
    aliases: ['megan@contoso.com', 'megan.bowen@contoso.com'],
    licenses: ['Microsoft 365 E5'],
    memberOf: [{ id: GROUP, name: 'Sales' }],
    forwarding: { smtp: 'megan.bowen@northwind.example', deliverAndForward: false },
    inboxRules: [{ name: 'Newsletters', enabled: true, description: 'If the subject contains "unsubscribe", move it to Junk.' }],
    fullAccess: [{ name: 'Adele Vance', address: 'adele.vance@contoso.com' }],
    sendAs: [],
    sendOnBehalf: [{ name: 'Adele Vance', address: 'adele.vance@contoso.com' }],
    granted: { fullAccess: [{ name: 'Sales', address: 'sales@contoso.com' }], sendAs: [{ name: 'Sales', address: 'sales@contoso.com' }] },
    litigationHold: false,
    retentionHold: false,
    retentionPolicy: 'Default MRM Policy',
    authPolicy: 'Default',
    cas: { mapi: true, ews: true, activeSync: true, pop: false, imap: false, smtp: false },
    signIns: [{ time: '2026-11-16T15:04:00Z', app: 'Outlook', status: 'Success', ip: '203.0.113.10' }],
    trace: [{ time: '2026-11-16T14:02:14Z', sender: 'bounce@northwind.example', recipient: 'megan.bowen@contoso.com', subject: 'Action required: update your deposit', status: 'Delivered', messageId: '<abc123@northwind.example>' }],
  },
  {
    id: ADELE,
    displayName: 'Adele Vance',
    primary: 'adele.vance@contoso.com',
    type: 'UserMailbox',
    size: '1.1 GB',
    quota: '100 GB',
    aliases: ['adele.vance@contoso.com'],
    licenses: ['Microsoft 365 E3'],
    memberOf: [{ id: GROUP, name: 'Sales' }],
    forwarding: { smtp: '', deliverAndForward: false },
    inboxRules: [],
    fullAccess: [],
    sendAs: [],
    sendOnBehalf: [],
    granted: { fullAccess: [], sendAs: [], sendOnBehalf: [] },
    litigationHold: true,
    retentionHold: false,
    retentionPolicy: 'Default MRM Policy',
    authPolicy: 'Block basic auth',
    cas: { mapi: true, ews: true, activeSync: true, pop: false, imap: false, smtp: true },
    signIns: [{ time: '2026-11-17T09:10:00Z', app: 'Office 365 Exchange Online', status: 'Success', ip: '203.0.113.11' }],
    trace: [{ time: '2026-11-17T09:15:04Z', sender: 'alex@fabrikam.example', recipient: 'adele.vance@contoso.com', subject: 'Q4 shipping calendar', status: 'Delivered', messageId: '<clean-100@fabrikam.example>' }],
  },
  {
    id: SALES,
    displayName: 'Sales',
    primary: 'sales@contoso.com',
    type: 'SharedMailbox',
    size: '800 MB',
    quota: '50 GB',
    aliases: ['sales@contoso.com'],
    licenses: [],
    memberOf: [],
    forwarding: { smtp: '', deliverAndForward: false },
    inboxRules: [],
    fullAccess: [{ name: 'Megan Bowen', address: 'megan.bowen@contoso.com' }, { name: 'Adele Vance', address: 'adele.vance@contoso.com' }],
    sendAs: [{ name: 'Megan Bowen', address: 'megan.bowen@contoso.com' }],
    sendOnBehalf: [],
    granted: { fullAccess: [], sendAs: [] },
    litigationHold: false,
    retentionHold: false,
    retentionPolicy: 'Default MRM Policy',
    authPolicy: 'Default',
    cas: { mapi: true, ews: true, activeSync: false, pop: false, imap: false, smtp: false },
    signIns: [],
    trace: [],
  },
  {
    id: ROOM,
    displayName: 'Conference Room 1',
    primary: 'room1@contoso.com',
    type: 'RoomMailbox',
    size: '40 MB',
    quota: '50 GB',
    aliases: ['room1@contoso.com'],
    licenses: [],
    memberOf: [],
    forwarding: { smtp: '', deliverAndForward: false },
    inboxRules: [],
    fullAccess: [],
    sendAs: [],
    sendOnBehalf: [],
    granted: { fullAccess: [], sendAs: [] },
    litigationHold: false,
    retentionHold: false,
    retentionPolicy: 'Default MRM Policy',
    authPolicy: 'Default',
    cas: { mapi: true, ews: true, activeSync: false, pop: false, imap: false, smtp: false },
    calendar: { automate: 'AutoAccept', allBookInPolicy: false, allowConflicts: false, bookInPolicy: ['Sales'] },
    signIns: [],
    trace: [],
  },
];

// Recipients without a user mailbox: a Microsoft 365 group, a distribution list, a mail contact and a mail user.
// Single recipient works for every one of them; pages that do not apply say so.
export const DEMO_RECIPIENTS = [
  {
    id: MARKETING, displayName: 'Marketing', primary: 'marketing@contoso.com', type: 'GroupMailbox',
    aliases: ['SMTP:marketing@contoso.com', 'smtp:marketing@contoso.onmicrosoft.com'],
    size: '2.3 GB', quota: '50 GB', licenses: [],
    forwarding: { smtp: '', deliverAndForward: false },
    inboxRules: [], fullAccess: [], cas: null,
    litigationHold: false, retentionHold: false, retentionPolicy: 'Default MRM Policy', authPolicy: '',
    signIns: [],
    memberOf: [],
    members: [{ name: 'Megan Bowen', address: 'megan.bowen@contoso.com', type: 'UserMailbox' }, { name: 'Adele Vance', address: 'adele.vance@contoso.com', type: 'UserMailbox' }],
    owners: [{ name: 'Megan Bowen', address: 'megan.bowen@contoso.com', type: 'UserMailbox' }],
    group: { privacy: 'Private', requireSenderAuth: true, acceptOnlyFrom: [], hidden: false, subscribeNewMembers: false },
    sendAs: [], sendOnBehalf: [{ name: 'Adele Vance', address: 'adele.vance@contoso.com' }],
    trace: [{ time: '2026-11-17T10:02:00Z', sender: 'adele.vance@contoso.com', recipient: 'marketing@contoso.com', subject: 'Launch plan v2', status: 'Delivered', messageId: '<launch-2@contoso.com>' }],
  },
  {
    id: ALLSTAFF, displayName: 'All Staff', primary: 'allstaff@contoso.com', type: 'MailUniversalDistributionGroup',
    aliases: ['SMTP:allstaff@contoso.com'],
    size: '', quota: '', licenses: [],
    forwarding: { smtp: '', deliverAndForward: false },
    inboxRules: [], fullAccess: [], cas: null,
    litigationHold: false, retentionHold: false, retentionPolicy: '', authPolicy: '',
    signIns: [],
    memberOf: [],
    members: [{ name: 'Megan Bowen', address: 'megan.bowen@contoso.com', type: 'UserMailbox' }, { name: 'Adele Vance', address: 'adele.vance@contoso.com', type: 'UserMailbox' }, { name: 'Sales', address: 'sales@contoso.com', type: 'SharedMailbox' }],
    owners: [{ name: 'Adele Vance', address: 'adele.vance@contoso.com', type: 'UserMailbox' }],
    group: { requireSenderAuth: true, acceptOnlyFrom: ['Megan Bowen', 'Adele Vance'], hidden: false, memberJoin: 'Closed', memberDepart: 'Closed' },
    sendAs: [], sendOnBehalf: [],
    trace: [{ time: '2026-11-16T08:00:00Z', sender: 'megan.bowen@contoso.com', recipient: 'allstaff@contoso.com', subject: 'Office closed Friday', status: 'Expanded', messageId: '<closed-fri@contoso.com>' }],
  },
  {
    id: CONTACT, displayName: 'Fabrikam Billing', primary: 'billing@fabrikam.example', type: 'MailContact',
    aliases: ['SMTP:billing@fabrikam.example'], externalAddress: 'billing@fabrikam.example',
    size: '', quota: '', licenses: [],
    forwarding: { smtp: '', deliverAndForward: false },
    inboxRules: [], fullAccess: [], cas: null,
    litigationHold: false, retentionHold: false, retentionPolicy: '', authPolicy: '',
    signIns: [],
    memberOf: [{ id: ALLSTAFF, name: 'All Staff' }],
    hidden: false, sendAs: [], sendOnBehalf: [],
    trace: [],
  },
  {
    id: MAILUSER, displayName: 'Pat Contractor', primary: 'pat.contractor@contoso.com', type: 'MailUser',
    aliases: ['SMTP:pat.contractor@contoso.com'], externalAddress: 'pat@northwind.example',
    size: '', quota: '', licenses: [],
    forwarding: { smtp: '', deliverAndForward: false },
    inboxRules: [], fullAccess: [], cas: null,
    litigationHold: false, retentionHold: false, retentionPolicy: '', authPolicy: 'Default',
    signIns: [{ time: '2026-11-17T12:30:00Z', app: 'Microsoft Teams', status: 'Success', ip: '198.51.100.20' }],
    memberOf: [{ id: GROUP, name: 'Sales' }],
    hidden: false, sendAs: [], sendOnBehalf: [],
    trace: [{ time: '2026-11-17T12:40:00Z', sender: 'megan.bowen@contoso.com', recipient: 'pat.contractor@contoso.com', subject: 'Contract renewal', status: 'Delivered', messageId: '<renew-1@contoso.com>' }],
  },
];

export const DEMO_ORG = {
  source: 'demo',
  tenant: 'Contoso (fictional)',
  defender: true,
  skus: [
    { skuPartNumber: 'SPE_E5', consumedUnits: 2, prepaidUnits: { enabled: 5 }, servicePlans: [{ servicePlanName: 'EXCHANGE_S_ENTERPRISE', provisioningStatus: 'Success' }, { servicePlanName: 'THREAT_INTELLIGENCE', provisioningStatus: 'Success' }] },
    { skuPartNumber: 'SPE_E3', consumedUnits: 8, prepaidUnits: { enabled: 20 }, servicePlans: [{ servicePlanName: 'EXCHANGE_S_ENTERPRISE', provisioningStatus: 'Success' }] },
    { skuPartNumber: 'ATP_ENTERPRISE', consumedUnits: 8, prepaidUnits: { enabled: 20 }, servicePlans: [{ servicePlanName: 'ATP_ENTERPRISE', provisioningStatus: 'Success' }] },
  ],
  domains: [
    {
      name: 'contoso.com', type: 'Authoritative', default: true,
      dns: {
        mx: { records: [{ preference: 0, exchange: 'contoso-com.mail.protection.outlook.com' }], exo: true, problems: [] },
        spf: { present: true, record: 'v=spf1 include:spf.protection.outlook.com -all', qualifier: '-', lookups: 1, exo: true, mechanisms: [{ qualifier: '+', mechanism: 'include', value: 'spf.protection.outlook.com' }, { qualifier: '-', mechanism: 'all' }], problems: [] },
        dmarc: { present: true, record: 'v=DMARC1; p=none; rua=mailto:dmarc@contoso.com', policy: 'none', pct: '100', adkim: 'r', aspf: 'r', rua: 'mailto:dmarc@contoso.com', problems: ['DMARC is p=none. Receivers report failures but do not quarantine or reject on DMARC alone. That is a normal starting point, and it is not enforcement.'] },
        dkim: [
          { selector: 'selector1', target: ['selector1-contoso-com._domainkey.contoso.onmicrosoft.com'], problems: [] },
          { selector: 'selector2', target: ['selector2-contoso-com._domainkey.contoso.onmicrosoft.com'], problems: [] },
        ],
        mtaSts: { present: true, record: 'v=STSv1; id=20261101', problems: [] },
        tlsRpt: { present: true, record: 'v=TLSRPTv1; rua=mailto:tlsrpt@contoso.com', problems: [] },
        autodiscover: { target: ['autodiscover.outlook.com'], exo: true, problems: [] },
      },
    },
    {
      name: 'fabrikam.example', type: 'InternalRelay', default: false,
      dns: {
        mx: { records: [{ preference: 10, exchange: 'mail.fabrikam.example' }], exo: false, problems: ['No MX points at Exchange Online Protection (*.mail.protection.outlook.com). Mail for this domain is not coming to this tenant, or a gateway is in front.'] },
        spf: { present: false, record: '', qualifier: '', lookups: 0, mechanisms: [], problems: ['No SPF TXT record (v=spf1) was published.'] },
        dmarc: { present: false, record: '', policy: '', problems: ['No DMARC TXT record at _dmarc.'] },
        dkim: [{ selector: 'selector1', target: [], problems: ['No CNAME for selector selector1._domainkey. DKIM signing for this selector is not published.'] }, { selector: 'selector2', target: [], problems: ['No CNAME for selector selector2._domainkey. DKIM signing for this selector is not published.'] }],
        mtaSts: { present: false, record: '', problems: ['No MTA-STS TXT record at _mta-sts. Senders that enforce MTA-STS will not find a policy id.'] },
        tlsRpt: { present: false, record: '', problems: ['No TLS-RPT TXT record at _smtp._tls. You will not receive SMTP TLS failure reports.'] },
        autodiscover: { target: [], exo: false, problems: ['No autodiscover CNAME. Outlook clients may not find this mailbox automatically.'] },
      },
    },
  ],
  remoteDomains: [
    { name: 'Default', domain: '*', autoForward: false },
    { name: 'Northwind', domain: 'northwind.example', autoForward: true },
  ],
  connectors: [
    { name: 'From Northwind gateway', direction: 'inbound', enabled: true, senderDomains: ['northwind.example'], tls: 'required', recipientDomains: [] },
    { name: 'To the journaling service', direction: 'outbound', enabled: true, recipientDomains: ['journal.example'], tls: 'required', senderDomains: [] },
  ],
  transportRules: [
    { name: 'Flag external spoof', priority: 0, state: 'Enabled', sentTo: [], sentToMemberOf: [], recipientDomainIs: ['contoso.com'], actions: ['Prepend the subject with [External]'], stopProcessing: false },
    { name: 'Disclaimer on Sales', priority: 1, state: 'Enabled', sentToMemberOf: [GROUP], actions: ['Append a disclaimer'], stopProcessing: false },
    { name: 'Disabled test rule', priority: 2, state: 'Disabled', sentTo: ['megan.bowen@contoso.com'], actions: ['Reject'], stopProcessing: true },
  ],
  presets: [
    { name: 'Standard', sentTo: [], sentToMemberOf: [GROUP], domains: [], applyToAll: false },
    { name: 'Strict', sentTo: ['adele.vance@contoso.com'], sentToMemberOf: [], domains: [], applyToAll: false },
  ],
  antiSpam: [
    { name: 'Executives', priority: 0, state: 'Enabled', policy: 'Strict custom', sentTo: ['adele.vance@contoso.com'] },
    { name: 'Everyone else', priority: 1, state: 'Enabled', policy: 'Default anti-spam', recipientDomainIs: ['contoso.com'] },
  ],
  antiPhish: [
    { name: 'Protect Contoso', priority: 0, state: 'Enabled', policy: 'Contoso anti-phish', recipientDomainIs: ['contoso.com'] },
  ],
  safeLinks: [
    { name: 'Sales Safe Links', priority: 0, state: 'Enabled', policy: 'Safe Links standard', sentToMemberOf: [GROUP] },
  ],
  safeAttachments: [
    { name: 'All mailboxes', priority: 0, state: 'Enabled', policy: 'Safe Attachments dynamic', recipientDomainIs: ['contoso.com'] },
  ],
  quarantine: [
    { name: 'Default quarantine', priority: 0, state: 'Enabled', policy: 'DefaultFullAccess', recipientDomainIs: ['contoso.com'] },
  ],
  config: {
    modernAuth: true,
    smtpAuthDisabled: true,
    oauth2: true,
    authPolicies: ['Default', 'Block basic auth'],
    owa: 'OwaMailboxPolicy-Default',
    mobile: 'Default',
    retention: ['Default MRM Policy'],
  },
  health: {
    authorized: true,
    services: [
      { name: 'Exchange Online', status: 'serviceOperational' },
      { name: 'Microsoft Defender for Office 365', status: 'serviceDegradation' },
    ],
    issues: [{ title: 'Some users see a delay opening quarantine', service: 'Exchange Online', classification: 'advisory', status: 'serviceDegradation', start: '2026-11-17T08:00:00Z', lastModifiedDateTime: '2026-11-17T10:30:00Z' }],
  },
  outlook: {
    source: 'demo',
    computer: 'CONTOSO-LAPTOP',
    outlook: { version: '16.0.17928.20114', channel: 'Monthly Enterprise', bitness: '64-bit' },
    profiles: [{ name: 'Adele', cached: true, ost: 'C:\\\\Users\\\\Adele\\\\AppData\\\\Local\\\\Microsoft\\\\Outlook\\\\adele.ost', ostBytes: 1200000000 }],
    addins: [{ name: 'Contoso CRM', location: 'HKCU' }],
    autodiscover: { host: 'autodiscover.outlook.com', result: 'Autodiscover answered for contoso.com (fictional).' },
    connectivity: [{ target: 'outlook.office365.com:443', ok: true }],
  },
};

export function demoMailbox(id) {
  const all = DEMO_MAILBOXES;
  if (!id) return all[0];
  const q = String(id).toLowerCase();
  return all.find(m => m.id === q || m.primary.toLowerCase() === q || m.displayName.toLowerCase().includes(q)) || null;
}

// Any demo recipient: the mailboxes above, then the groups, contact and mail user.
export function demoRecipient(id) {
  if (!id) return DEMO_MAILBOXES[0];
  const q = String(id).toLowerCase();
  return demoMailbox(id) || DEMO_RECIPIENTS.find(m => m.id === q || m.primary.toLowerCase() === q || m.displayName.toLowerCase().includes(q)) || null;
}

export function demoSnapshot() {
  return { org: DEMO_ORG, mailboxes: DEMO_MAILBOXES.map(m => ({ id: m.id, displayName: m.displayName, primary: m.primary, type: m.type })) };
}
