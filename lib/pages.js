// Rail pages. Each icon is used once. Hash routes are the id. `group` puts a page under a collapsible
// sub-heading inside its section (Organization > Access and assignments, Organization > Compliance, Organization > Auditing/Logging).
export const PAGES = [
  { id: 'setup', title: 'Setup steps', section: 'Setup', icon: 'wrench', blurb: 'Every one-off setting Ex360 needs, checked live with your own sign-in, with the exact fix for anything that fails.' },
  { id: 'start', title: 'Start here', section: 'New hire', icon: 'compass', blurb: 'What Exchange Online is, the first 15 minutes, and the first three weeks.' },
  { id: 'needs', title: 'License, Roles and Permissions', section: 'New hire', icon: 'clipboard-list', blurb: 'For each Ex360 feature: the license the tenant needs, and the roles, role groups and permissions your own account needs. One entry per line, grouped under Permissions, Role and so on, with OR between alternatives. Each feature links to the Microsoft Learn article it was checked against.' },
  { id: 'asked', title: 'Someone just asked', section: 'New hire', icon: 'siren', blurb: 'The sentence in the ticket, and the page that answers it.' },
  { id: 'glossary', title: 'Glossary', section: 'New hire', icon: 'book-open', blurb: 'The words a new hire hears in the first week, in one table you can filter by category, search and sort.' },
  { id: 'learn', title: 'Learn', section: 'New hire', icon: 'graduation-cap', blurb: 'Short explanations, each with a Microsoft Learn article.' },
  { id: 'playbooks', title: 'Playbooks', section: 'New hire', icon: 'scroll-text', blurb: 'What to do for the incidents that actually show up.' },
  { id: 'review', title: 'Config review', section: 'Organization', icon: 'scan-search', blurb: 'Every area of the tenant checked in plain words: what is configured, what looks wrong, why it matters, and what to check next.' },
  { id: 'health', title: 'Service health', section: 'Organization', icon: 'heart-pulse', blurb: 'Microsoft 365 service health for Exchange Online and the services mail flow depends on, plus the public Microsoft 365 and Azure status pages.' },
  { id: 'rcp-shared', title: 'Shared mailboxes', section: 'Organization', group: 'Mailboxes', icon: 'door-open', blurb: 'Every shared mailbox in one searchable table: who has Full Access, whether direct sign-in is blocked, forwarding and sent items copies.' },
  { id: 'rcp-resources', title: 'Room and equipment mailboxes', section: 'Organization', group: 'Mailboxes', icon: 'map-pin', blurb: 'Every room and equipment mailbox in one searchable table, with capacity and how booking works.' },
  { id: 'rcp-forwarding', title: 'Mailboxes that forward', section: 'Organization', group: 'Mailboxes', icon: 'refresh-cw', blurb: 'Every mailbox with a forwarding address, in one searchable table. Inbox rules that forward are per mailbox, on Single recipient > Forwarding.' },
  { id: 'rcp-groups', title: 'Distribution and mail-enabled security groups', section: 'Organization', group: 'Mail-enabled groups', icon: 'at-sign', blurb: 'Every distribution list and mail-enabled security group in one searchable table: members, owners, mail from outside, moderation and joining.' },
  { id: 'rcp-dynamic', title: 'Dynamic distribution groups', section: 'Organization', group: 'Mail-enabled groups', icon: 'wand-sparkles', blurb: 'Every dynamic distribution group in one searchable table, with the filter that decides who is in it.' },
  { id: 'rcp-m365', title: 'Microsoft 365 groups', section: 'Organization', group: 'Mail-enabled groups', icon: 'cloud', blurb: 'Every Microsoft 365 group in one searchable table: privacy, members, guests, owners and mail from outside.' },
  { id: 'rules', title: 'Mail flow rules', section: 'Organization', icon: 'sliders-horizontal', blurb: 'Transport rules in priority order.' },
  { id: 'user-roles', title: 'User roles', section: 'Organization', group: 'Access and assignments', icon: 'user-plus', blurb: 'Role assignment policies: what people may change in their own mailbox and distribution groups, from Outlook and Outlook on the web.' },
  { id: 'admin-roles', title: 'Admin roles', section: 'Organization', group: 'Access and assignments', icon: 'user-cog', blurb: 'Exchange admin roles (role groups) with their roles and members, and the Microsoft Entra roles that reach Exchange Online.' },
  { id: 'role-assignments', title: 'Role assignments and scopes', section: 'Organization', group: 'Access and assignments', icon: 'fingerprint', blurb: 'Every Exchange management role assignment (who holds which role, over which recipients) and the management scopes that limit them.' },
  { id: 'app-rbac', title: 'App access', section: 'Organization', group: 'Access and assignments', icon: 'app-window', blurb: 'Apps that can read or send mail: RBAC for Applications service principals and their role assignments, and legacy application access policies.' },
  { id: 'dlp', title: 'DLP', section: 'Organization', group: 'Compliance', icon: 'file-badge', blurb: 'Data loss prevention policies and rules, including test mode and the Exchange workload.' },
  { id: 'labels', title: 'Sensitivity labels', section: 'Organization', group: 'Compliance', icon: 'badge-check', blurb: 'Sensitivity labels and the policies that publish them.' },
  { id: 'retention-cc', title: 'Retention', section: 'Organization', group: 'Compliance', icon: 'file-text', blurb: 'Purview retention policies and retention labels.' },
  { id: 'ediscovery', title: 'eDiscovery', section: 'Organization', group: 'Compliance', icon: 'search-code', blurb: 'eDiscovery cases and the holds on them.' },
  { id: 'compliance-admin', title: 'Compliance admin', section: 'Organization', group: 'Compliance', icon: 'crown', blurb: 'Purview role groups and who is in them.' },
  { id: 'security', title: 'Security policies', section: 'Organization', icon: 'shield-check', blurb: 'Which policy wins for a person, with a page for each kind of policy under it.' },
  { id: 'sec-antispam', title: 'Anti-spam', section: 'Organization', group: 'Security policies', icon: 'radar', blurb: 'Inbound anti-spam policies and the rules that say who each one covers.' },
  { id: 'sec-antiphish', title: 'Anti-phishing', section: 'Organization', group: 'Security policies', icon: 'gauge', blurb: 'Anti-phishing policies: spoof intelligence, impersonation protection and mailbox intelligence.' },
  { id: 'sec-antimalware', title: 'Anti-malware', section: 'Organization', group: 'Security policies', icon: 'test-tube', blurb: 'Anti-malware policies: the common attachments filter, zero-hour purge and quarantine.' },
  { id: 'sec-safelinks', title: 'Safe Links', section: 'Organization', group: 'Security policies', icon: 'flask-conical', blurb: 'Safe Links policies (Defender for Office 365): URL scanning in email, Teams and Office apps.' },
  { id: 'sec-safeattach', title: 'Safe Attachments', section: 'Organization', group: 'Security policies', icon: 'package-check', blurb: 'Safe Attachments policies (Defender for Office 365): attachments opened in a sandbox before delivery.' },
  { id: 'sec-outbound', title: 'Outbound spam and forwarding', section: 'Organization', group: 'Security policies', icon: 'refresh-ccw', blurb: 'Outbound spam policies: sending limits and whether automatic forwarding to outside addresses is allowed.' },
  { id: 'sec-connection', title: 'Connection filter and allow list', section: 'Organization', group: 'Security policies', icon: 'monitor-dot', blurb: 'The connection filter policy (IP allow and block lists) and tenant allow entries for senders.' },
  { id: 'sec-quarantine', title: 'Quarantine policies', section: 'Organization', group: 'Security policies', icon: 'ticket', blurb: 'Quarantine policies: what recipients may do with held mail, and whether they get notifications.' },
  { id: 'domains', title: 'Domains and DNS', section: 'Organization', icon: 'globe', blurb: 'Accepted and remote domains, with MX, SPF, DKIM, DMARC, MTA-STS, TLS-RPT and Autodiscover.' },
  { id: 'connectors', title: 'Connectors', section: 'Organization', icon: 'plug', blurb: 'Inbound and outbound connectors.' },
  { id: 'config', title: 'Org config', section: 'Organization', icon: 'settings', blurb: 'Authentication policy, SMTP AUTH, modern auth, Outlook on the web, mobile and retention.' },
  { id: 'licenses', title: 'Licenses', section: 'Organization', icon: 'receipt', blurb: 'Your subscriptions with available and assigned licenses, as on Microsoft 365 admin center > Billing > Licenses.' },
  { id: 'migrations', title: 'Migrations', section: 'Organization', icon: 'boxes', blurb: 'Migration endpoints, batches, and move requests. Read-only.' },
  { id: 'audit', title: 'Audit', section: 'Organization', group: 'Auditing/Logging', icon: 'file-chart-column', blurb: 'Whether the unified audit log is on, and a read-only search.' },
  { id: 'changes', title: 'Change history', section: 'Organization', group: 'Auditing/Logging', icon: 'timer', blurb: 'Who changed Exchange configuration, from the admin audit log.' },
  { id: 'mb-recipient', title: 'Recipient', section: 'Single recipient', icon: 'circle-user', blurb: 'One recipient that can receive mail: user, shared, room or equipment mailbox, Microsoft 365 group, distribution list, mail-enabled security group, dynamic distribution list, mail contact, mail user or mail-enabled public folder. Its type, addresses, delivery settings and members, with a PDF report for a mailbox.' },
  { id: 'mb-forward', title: 'Forwarding', section: 'Single recipient', icon: 'git-pull-request', blurb: 'Mailbox forwarding and inbox rules that forward.' },
  { id: 'mb-rules', title: 'Inbox rules', section: 'Single recipient', icon: 'stamp', blurb: 'Rules inside the mailbox.' },
  { id: 'mb-delegation', title: 'Delegation', section: 'Single recipient', icon: 'key-round', blurb: 'Full Access, Send As and Send on Behalf, both ways.' },
  { id: 'mb-groups', title: 'Member of', section: 'Single recipient', icon: 'users', blurb: 'Groups this recipient belongs to.' },
  { id: 'mb-policies', title: 'Policies that apply', section: 'Single recipient', icon: 'shield-half', blurb: 'Which security, transport and retention policies match, and why.' },
  { id: 'mb-protocols', title: 'Protocols', section: 'Single recipient', icon: 'smartphone', blurb: 'MAPI, EWS, ActiveSync, POP, IMAP and SMTP AUTH.' },
  { id: 'mb-signins', title: 'Sign-ins', section: 'Single recipient', icon: 'log-in', blurb: 'The last 10 sign-ins, with Show all for the rest, when the tenant license and your role allow it.' },
  { id: 'mb-findings', title: 'Findings', section: 'Single recipient', icon: 'shield-alert', blurb: 'What on this recipient is worth a second look.' },
  { id: 'mb-compliance', title: 'Compliance on this recipient', section: 'Single recipient', icon: 'file-check', blurb: 'Which DLP, retention and hold policies apply, and why.' },
  { id: 'mb-ca', title: 'Conditional Access', section: 'Single recipient', icon: 'lock-keyhole', blurb: 'Conditional Access policies that include Exchange Online for this user.' },
  { id: 'mb-xdr', title: 'Defender XDR', section: 'Single recipient', icon: 'bug', blurb: 'Incidents and alerts for this recipient, read-only, with portal links.' },
  { id: 'trace', title: 'Trace a message', section: 'Troubleshoot', icon: 'arrow-left-right', blurb: 'Message trace by sender, recipient, message ID or subject for up to 10 days. Select a message for its events, the rules that acted on it, and the exact PowerShell.' },
  { id: 'nexthop', title: 'NextHop', section: 'Troubleshoot', icon: 'blocks', blurb: 'Predict what Exchange Online would do with a test message, inbound or outbound, from configuration only: every step in order, what happens and why, and the setting that caused it. Uses the Contoso sample topology or an export of your tenant. Nothing is sent.' },
  { id: 'quarantine', title: 'Quarantine', section: 'Troubleshoot', icon: 'ban', blurb: 'What is held in quarantine, which policy held it, and who can release it. Read-only.' },
  { id: 'hops', title: 'Message hops', section: 'Troubleshoot', icon: 'activity', blurb: 'Every hop of a message, and what the filter stamps mean.' },
  { id: 'outlook', title: 'Outlook on this PC', section: 'Troubleshoot', icon: 'laptop', blurb: 'A read-only collector you run in Windows. The container cannot see Outlook itself.' },
  { id: 'onprem', title: 'On-premises', section: 'On-premises', icon: 'server', blurb: 'A placeholder. On-premises Exchange is a later version.' },
];

export const PAGE_IDS = new Set(PAGES.map(p => p.id));

export function isPage(id) { return PAGE_IDS.has(id); }

export function sections() {
  const out = [];
  for (const page of PAGES) {
    let section = out.find(s => s.title === page.section);
    if (!section) { section = { title: page.section, pages: [] }; out.push(section); }
    section.pages.push(page);
  }
  return out;
}
