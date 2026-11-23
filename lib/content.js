// Static pages for someone who was just told they own Exchange Online.
// License and role statements point at Microsoft Learn. Checked 2026-11-17.

export const FIRST_MINUTES = [
  { id: 'open', title: 'Read this page once', minutes: '3 min', why: 'Exchange Online is the service that holds the mailboxes. Exchange Online Protection is the filter in front of it. They are configured in different portals.', how: 'Stay on Start here. The next two steps open the pages you will use every week.', open: { view: 'start', label: 'Stay on Start here' } },
  { id: 'domains', title: 'Look at the domains', minutes: '5 min', why: 'If MX, SPF or DKIM is wrong, nothing else you change will make mail arrive.', how: 'Open Domains and DNS. In demo mode the rows are Contoso. When you are signed in they are your accepted domains, with a live DNS check.', open: { view: 'domains', label: 'Open Domains and DNS' } },
  { id: 'hops', title: 'Read one message hop by hop', minutes: '7 min', why: 'The headers are where a "it went to junk" question is actually answered. SCL, SPF and DMARC are just fields in that header.', how: 'Open Message hops and load the sample spoofed message. Read the plain-language lines before you read the raw header.', open: { view: 'hops', label: 'Open Message hops' } },
];

export const PHASES = [
  { id: 'week1', title: 'Week 1', sub: 'Learn the words and practise on the sample' },
  { id: 'week23', title: 'Weeks 2 and 3', sub: 'Find out what this tenant actually does' },
  { id: 'after', title: 'Every week after that', sub: 'Health, then the queue of questions' },
];

export const PATH = [
  { id: 'words', phase: 'week1', title: 'Learn ten words', minutes: '30 min', why: 'People will say connector, transport rule, SCL and compauth as if they were obvious.', how: 'Read the glossary once. You do not need to memorise it.', open: { view: 'glossary', label: 'Open the glossary' } },
  { id: 'sample', phase: 'week1', title: 'Explain the sample spoof out loud', minutes: '20 min', why: 'If you can say why the payroll message failed DMARC, you can do the real one.', how: 'Message hops, sample "Spoofed payroll message".', open: { view: 'hops', label: 'Open the sample' } },
  { id: 'needs', phase: 'week1', title: 'See which role you are missing', minutes: '15 min', why: 'A blank table usually means your account cannot read that data. The page should say which permission.', how: 'Open License, Roles and Permissions and compare it with the roles on your account.', open: { view: 'needs', label: 'Open License, Roles and Permissions' } },
  { id: 'sign', phase: 'week23', title: 'Sign in and read the org from the top', minutes: '45 min', why: 'Licenses decide which buttons even exist. Domains decide where mail goes. Rules and connectors decide the exceptions.', how: 'Sign in. Open Licenses, then Domains and DNS, Mail flow rules, Security policies and Config review.', open: { view: 'licenses', label: 'Open Licenses' } },
  { id: 'onebox', phase: 'week23', title: 'Pick one real mailbox and read the pane', minutes: '30 min', why: 'The org view is the policy. The mailbox pane is what that policy did to one person.', how: 'Open Single recipient > Recipient and pick someone who has complained recently.', open: { view: 'mb-recipient', label: 'Open Single recipient' } },
  { id: 'trace', phase: 'week23', title: 'Run one message trace', minutes: '20 min', why: 'Headers tell you what the filter thought. Message trace tells you whether Exchange received the message at all.', how: 'You need an Exchange role that includes message tracking. The trace page names it if you do not.', open: { view: 'trace', label: 'Open Trace a message' } },
  { id: 'health', phase: 'after', title: 'Check service health before you debug a one-off', minutes: '5 min', why: 'A tenant-wide mail delay is often a service incident, not a transport rule.', how: 'Open Service health. If Exchange is healthy, then look at the one message.', open: { view: 'health', label: 'Open service health' } },
  { id: 'play', phase: 'after', title: 'Keep the playbooks next to the ticket', minutes: '10 min', why: 'The same six incidents come back: not arriving, junk, an NDR, spoofing, forwarding, a shared mailbox.', how: 'Open Playbooks and read the one that matches the sentence in the ticket.', open: { view: 'playbooks', label: 'Open playbooks' } },
];

export const SITUATIONS = [
  { when: 'Someone says mail is not arriving', do: 'Confirm the sender got an NDR. If they did, look up the 5.7 code. If they did not, run a message trace for the sender and the recipient, then read the hop list if you have the headers.', open: { view: 'playbooks', label: 'Mail not arriving' } },
  { when: 'Mail is in Junk', do: 'Get the headers from the Junk folder. SCL and CAT tell you the verdict. SFV tells you whether a list or a rule forced it.', open: { view: 'hops', label: 'Message hops' } },
  { when: 'They forwarded an NDR', do: 'Find the 5.7.x code in the NDR and open the matching row. Do not change a policy until the code says which one.', open: { view: 'playbooks', label: 'NDR codes' } },
  { when: 'Someone is being spoofed', do: 'Check DMARC on your domains, then the hop analyzer for compauth and CAT:SPOOF. p=none will not stop it.', open: { view: 'domains', label: 'Domains and DNS' } },
  { when: 'Forwarding to Gmail stopped', do: 'Look for NDR 5.7.520. Automatic external forwarding is blocked by the outbound spam policy unless an admin allows it.', open: { view: 'mb-forward', label: 'Forwarding' } },
  { when: 'A shared mailbox is missing', do: 'Full Access is not the same as Send As, and neither one puts the mailbox in Outlook until Autodiscover and the client catch up.', open: { view: 'mb-delegation', label: 'Delegation' } },
  { when: 'A room declined the meeting', do: 'Resource mailboxes have their own booking policy. The room is a mailbox, not a calendar setting on the person.', open: { view: 'playbooks', label: 'Room booking' } },
  { when: 'They want SMTP from a scanner', do: 'Anonymous SMTP to smtp.office365.com returns 5.7.57. The device must authenticate as a mailbox, or you use a connector.', open: { view: 'config', label: 'Org config' } },
  { when: 'DLP blocked or tipped an email', do: 'Open Compliance, DLP. Test mode tips and does not block. Enable can block. A policy with no Exchange workload did not do this. The hop analyzer calls out DLP headers and DLP events from message trace detail.', open: { view: 'dlp', label: 'DLP' } },
  { when: 'Is this mailbox on hold', do: 'Open the mailbox, then Compliance on this mailbox. Litigation hold is a mailbox flag. A Purview retention policy and an eDiscovery hold are separate, and the page says which one names this mailbox.', open: { view: 'mb-compliance', label: 'Compliance on this mailbox' } },
];

export const ASK_THE_TEAM = [
  'Which domains send mail, and which only receive it?',
  'Is there anything in front of Exchange Online (a gateway, a signature service) that changes messages?',
  'Who is allowed to change transport rules, and where is that change written down?',
  'Is external forwarding supposed to be off?',
  'Do we have Defender for Office 365 Plan 1 or Plan 2, or only Exchange Online Protection?',
  'What is DMARC set to today, and who reads the aggregate reports?',
  'Which DLP policies are still in test mode, and who is allowed to move one to Enable?',
  'Who is in the Purview Compliance Administrator role group?',
];

// [term, meaning, category]. The Glossary page filters on the category with a drop-down.
export const GLOSSARY_CATEGORIES = ['Mail flow', 'Spam and phishing', 'Email authentication', 'DNS', 'Mailboxes and permissions', 'Sign-in and client access', 'Compliance and retention'];

export const GLOSSARY = [
  ['Accepted domain', 'A domain this tenant will accept mail for. Authoritative means the mailbox is here. Internal relay means some recipients still live somewhere else.', 'Mail flow'],
  ['Remote domain', 'Settings for mail leaving to a domain: automatic forwarding, out-of-office, and message format. It is not the list of domains you own.', 'Mail flow'],
  ['Connector', 'A route. An inbound connector tells Exchange to trust mail from a partner or from on-premises. An outbound connector sends mail for some domains via a smart host.', 'Mail flow'],
  ['Transport rule', 'A mail flow rule. It runs in priority order on messages that match its conditions. It can stamp a header, prepend a subject, or reject the message.', 'Mail flow'],
  ['SCL', 'Spam confidence level, from -1 or 0 through 9. In Exchange Online the action is decided by the category and the filtering verdict, not by this number alone.', 'Spam and phishing'],
  ['BCL', 'Bulk complaint level. Higher means the mail looks more like bulk. The default threshold that treats it as spam is 7.', 'Spam and phishing'],
  ['PCL', 'Phish confidence level stamped beside the spam headers. Higher means the filter is more sure the message is phishing.', 'Spam and phishing'],
  ['SFV', 'The spam filtering verdict. SPM means it was marked spam. NSPM means it was not. SKN means a transport rule bypassed filtering.', 'Spam and phishing'],
  ['CAT', 'The threat category, such as SPM, SPOOF, PHSH or BULK. Some categories exist only with Defender for Office 365.', 'Spam and phishing'],
  ['CIP', 'The connecting IP address Exchange Online Protection actually saw.', 'Spam and phishing'],
  ['compauth', 'Microsoft\'s composite authentication result. It mixes SPF, DKIM, DMARC and other signals, judged against the From domain.', 'Email authentication'],
  ['DMARC alignment', 'The domain that passed SPF or DKIM has to match the domain in the From address the person sees. Relaxed alignment allows a subdomain. Strict does not.', 'Email authentication'],
  ['SPF', 'A TXT record that lists which servers may send mail for a domain. -all means "everyone else fails". Exchange Online\'s include is spf.protection.outlook.com.', 'Email authentication'],
  ['DKIM', 'A signature on the message. The public key is in DNS under a selector, usually selector1 and selector2 for Microsoft 365.', 'Email authentication'],
  ['ARC', 'Authenticated Received Chain. A sealer in the middle can vouch for the authentication result from before it modified the message.', 'Email authentication'],
  ['AuthAs', 'How Exchange classified the sender: Anonymous (internet), Internal (a mailbox here), or Partner (a connector).', 'Email authentication'],
  ['EOP', 'Exchange Online Protection. The filter included with Exchange Online: anti-spam, anti-malware, and the basic spoof checks.', 'Spam and phishing'],
  ['MDO', 'Microsoft Defender for Office 365. Plan 1 adds Safe Links, Safe Attachments and anti-phish policies. Plan 2 adds impersonation intelligence, attack simulation and automated investigation.', 'Spam and phishing'],
  ['Preset security policy', 'Standard or Strict. Microsoft builds the policy. If a mailbox is in one, it wins over your custom anti-spam and anti-phish rules.', 'Spam and phishing'],
  ['Quarantine', 'Where a policy holds a message instead of delivering it. The recipient may or may not be allowed to release it, depending on the quarantine policy.', 'Spam and phishing'],
  ['NDR', 'Non-delivery report. The bounce. The useful part is the enhanced status code, often 5.7.something.', 'Mail flow'],
  ['Shared mailbox', 'A mailbox several people open. It does not need its own licence under the usual size limit. Access is Full Access, Send As, or Send on Behalf.', 'Mailboxes and permissions'],
  ['Full Access', 'The right to open the mailbox and read it. It does not by itself let you send as that address.', 'Mailboxes and permissions'],
  ['Send As', 'The message is from the mailbox. The recipient does not see that someone else sent it.', 'Mailboxes and permissions'],
  ['Send on Behalf', 'The message shows "Alex on behalf of Sales". It is a different permission from Send As.', 'Mailboxes and permissions'],
  ['Inbox rule', 'A rule inside one mailbox, owned by that mailbox, not by the transport rules. It can forward or delete after the message is delivered.', 'Mailboxes and permissions'],
  ['Forwarding', 'Mailbox forwarding is on the mailbox object. An inbox rule can also forward. Outbound spam policy can block both when the target is outside the tenant.', 'Mail flow'],
  ['SMTP AUTH', 'Authenticated SMTP for devices and apps. Off by default for the organization in many tenants. Anonymous SMTP to Office 365 is rejected.', 'Sign-in and client access'],
  ['Modern authentication', 'Sign-in with OAuth and MFA instead of basic auth. Exchange Online has it on for the organization.', 'Sign-in and client access'],
  ['Authentication policy', 'Per-mailbox control of which protocols may use basic authentication. It does not replace Conditional Access.', 'Sign-in and client access'],
  ['Litigation hold', 'Keeps mailbox content from being purged. Needs Exchange Online Plan 2. Different from a retention policy, which is set in Purview.', 'Compliance and retention'],
  ['Retention hold', 'Pauses the mailbox retention policy so it does not delete or archive while you are working on the mailbox.', 'Compliance and retention'],
  ['MRM', 'Messaging records management. The older Exchange retention policy and retention tags. Purview retention policies are the newer system and can apply as well.', 'Compliance and retention'],
  ['CAS', 'Client access settings on a mailbox: whether Outlook (MAPI), Exchange Web Services, ActiveSync, POP, IMAP and authenticated SMTP are enabled.', 'Sign-in and client access'],
  ['Autodiscover', 'The DNS name Outlook uses to find the mailbox. For Exchange Online it is a CNAME to autodiscover.outlook.com.', 'DNS'],
  ['MX', 'The DNS record that says which servers receive mail for a domain. For a domain fully hosted on Exchange Online it points at mail.protection.outlook.com.', 'DNS'],
  ['MTA-STS', 'A policy that tells senders they must use TLS and a certificate that matches your MX. Published in DNS and on a web page.', 'DNS'],
  ['TLS-RPT', 'A DNS record asking senders to mail you reports when TLS to your domain fails.', 'DNS'],
  ['Resource mailbox', 'A room or equipment mailbox. Booking policy decides who can reserve it and whether it declines conflicts.', 'Mailboxes and permissions'],
  ['Distribution group', 'A list of recipients. It can require senders to be authenticated, which is why outside mail bounces with 5.7.133.', 'Mailboxes and permissions'],
  ['Journaling', 'A copy of messages sent to a journal mailbox. Not the same as litigation hold. Left for a later version if you are not using it yet.', 'Mail flow'],
  ['Hybrid', 'Mailboxes split between on-premises Exchange and Exchange Online, with connectors between them. On-premises queues are not in this version.', 'Mail flow'],
  ['DLP', 'Data loss prevention. A policy and rules that inspect mail (and other workloads) for things like credit card numbers. Test mode tips or logs. Enable can block. A policy that does not include Exchange does not apply to mail.', 'Compliance and retention'],
  ['Sensitivity label', 'A Purview label that marks content, such as Confidential. A label policy publishes labels to people. Automatic labeling is an E5 capability.', 'Compliance and retention'],
  ['Retention label', 'A tag a person or a policy applies to an item so it is kept or deleted on a schedule. Different from a mailbox retention policy and from litigation hold.', 'Compliance and retention'],
  ['eDiscovery hold', 'A hold created from an eDiscovery case. It keeps content for that case. It is not the same switch as litigation hold on the mailbox.', 'Compliance and retention'],
  ['Unified audit log', 'The record of admin and user activity in Microsoft 365. It has to be turned on. Search is a read. Creating a new audit query job is a write, and Ex360 does not do that.', 'Compliance and retention'],
  ['Admin audit log', 'Exchange\'s own record of who ran which configuration cmdlet. Search-AdminAuditLog reads it. It is not the Entra directory audit.', 'Compliance and retention'],
  ['Conditional Access', 'Entra policies that require MFA or block sign-in for chosen apps. A policy affects Exchange when its cloud apps include Exchange Online, Office 365, or all apps, and the user is in scope.', 'Sign-in and client access'],
  ['Migration batch', 'A set of mailbox moves. Read with Get-MigrationBatch and Get-MoveRequest. Starting or stopping a batch is a change, and Ex360 does not do it.', 'Mailboxes and permissions'],
];

// What each feature needs, in this shape: the tenant column is one license per line,
// and the account column is groups under a heading (Permissions:, Role:, ...) with one entry per line and OR between
// alternatives. An entry is a string or { name, note }. Groups next to each other without OR are both needed.
export const NEED_KINDS = {
  'Permissions': 'Delegated Microsoft Graph or Exchange Online permissions. Consented once on the Ex360 app registration (Setup steps checks this).',
  'Role': 'A Microsoft Entra directory role assigned to your account.',
  'Exchange role group': 'An Exchange Online role group your account is a member of.',
  'Purview role group': 'A Microsoft Purview role group your account is a member of.',
  'Mailbox access': 'A permission on one mailbox, granted by an Exchange admin.',
  'Sign-in': 'A separate sign-in Ex360 makes with your account.',
  'Portal role': 'Whatever role the Microsoft portal itself checks when you open it.',
};
export const OR = 'OR';
const g = (kind, ...items) => ({ kind, items });
const P = (...items) => g('Permissions', ...items);
const R = (...items) => g('Role', ...items);
const XG = (...items) => g('Exchange role group', ...items);
const PG = (...items) => g('Purview role group', ...items);

export const FEATURE_NEEDS = [
  { feature: 'See users, licenses and domains', learn: 'https://learn.microsoft.com/en-us/graph/permissions-reference',
    tenant: ['Microsoft 365', 'Exchange Online'],
    you: [P('Directory.Read.All', 'Organization.Read.All', 'Domain.Read.All'), OR, R('Global Reader')] },
  { feature: 'Accepted domains, connectors, transport rules, mailbox settings', learn: 'https://learn.microsoft.com/en-us/powershell/exchange/app-only-auth-powershell-v2?view=exchange-ps',
    tenant: ['Exchange Online'],
    you: [P('Exchange.Manage'), OR, XG('View-Only Organization Management'), OR, R('Global Reader')] },
  { feature: 'Message trace', learn: 'https://learn.microsoft.com/en-us/exchange/monitoring/trace-an-email-message/message-trace-modern-eac',
    tenant: ['Exchange Online'],
    you: [P('Exchange.Manage'), OR, XG({ name: 'View-Only Recipients', note: 'or any role group with message tracking' }), OR, R('Security Reader')] },
  { feature: 'Anti-spam and anti-malware', learn: 'https://learn.microsoft.com/en-us/defender-office-365/eop-about',
    tenant: [{ name: 'Exchange Online Protection', note: 'included with Exchange Online' }],
    you: [R('Security Reader')] },
  { feature: 'Safe Links and Safe Attachments', learn: 'https://learn.microsoft.com/en-us/defender-office-365/mdo-about',
    tenant: ['Microsoft Defender for Office 365 Plan 1', OR, 'Microsoft 365 E5', OR, 'Microsoft 365 Business Premium'],
    you: [R('Security Reader')] },
  { feature: 'Impersonation, attack simulation, automated investigation', learn: 'https://learn.microsoft.com/en-us/defender-office-365/mdo-about',
    tenant: ['Microsoft Defender for Office 365 Plan 2', OR, 'Microsoft 365 E5'],
    you: [R('Security Reader')] },
  { feature: 'Sign-in logs for a mailbox', learn: 'https://learn.microsoft.com/en-us/entra/identity/monitoring-health/concept-sign-ins',
    tenant: ['Microsoft Entra ID P1', OR, 'Microsoft Entra ID P2'],
    you: [P('AuditLog.Read.All'), OR, R('Reports Reader'), OR, R('Security Reader'), OR, R('Global Reader')] },
  { feature: 'Service health', learn: 'https://learn.microsoft.com/en-us/graph/api/resources/servicehealth-overview',
    tenant: ['Microsoft 365'],
    you: [P('ServiceHealth.Read.All'), OR, R('Global Reader')] },
  { feature: 'Read a message\'s headers from the mailbox', learn: 'https://learn.microsoft.com/en-us/graph/api/message-get',
    tenant: ['Exchange Online'],
    you: [P({ name: 'Mail.Read', note: 'your own mailbox' }), OR, P({ name: 'Mail.Read.Shared', note: 'someone else\'s mailbox' }), g('Mailbox access', { name: 'Full Access', note: 'to that mailbox' })] },
  { feature: 'Retention and holds', learn: 'https://learn.microsoft.com/en-us/purview/retention',
    tenant: [{ name: 'Exchange Online Plan 2', note: 'litigation hold' }, { name: 'Microsoft 365', note: 'Purview retention' }],
    you: [PG({ name: 'Compliance Administrator', note: 'Purview retention' }), XG({ name: 'View-Only Organization Management', note: 'hold flags on the mailbox' })] },
  { feature: 'Change any of the above', learn: 'https://learn.microsoft.com/en-us/exchange/permissions-exo/permissions-exo',
    tenant: [{ name: 'The same license as reading it', note: 'Ex360 changes nothing' }],
    you: [g('Portal role', { name: 'The role the portal asks for', note: 'Ex360 shows the link even when you cannot edit' })] },
  { feature: 'DLP, sensitivity labels, retention labels, eDiscovery, unified audit', learn: 'https://learn.microsoft.com/en-us/purview/purview',
    tenant: [{ name: 'Microsoft 365 E3', note: 'the core of each' }, { name: 'Microsoft 365 E5', note: 'automatic labeling, eDiscovery Premium, Advanced Audit' }],
    you: [P('InformationProtectionPolicy.Read', 'RecordsManagement.Read.All', 'eDiscovery.Read.All', 'AuditLogsQuery.Read.All'), g('Sign-in', { name: 'Security & Compliance PowerShell', note: 'reads DLP policies' }), OR, PG('Compliance Administrator')] },
  { feature: 'Defender XDR incidents', learn: 'https://learn.microsoft.com/en-us/defender-xdr/microsoft-365-defender',
    tenant: ['Microsoft 365 E5', OR, 'Microsoft Defender for Office 365 Plan 2'],
    you: [P('SecurityIncident.Read.All', 'SecurityAlert.Read.All'), OR, R('Security Reader')] },
  { feature: 'Migrations, Exchange role groups, admin audit', learn: 'https://learn.microsoft.com/en-us/exchange/recipients-in-exchange-online/manage-user-mailboxes/mailbox-migration',
    tenant: ['Exchange Online'],
    you: [P('Exchange.Manage'), OR, XG({ name: 'Organization Management', note: 'or any role group that reads migration and the admin audit log' })] },
];

export const LEARN = [
  { id: 'what', title: 'What Exchange Online actually is', body: 'A mailbox lives in Exchange Online. Mail from the internet hits Exchange Online Protection first, which is where anti-spam, anti-malware, SPF, DKIM and DMARC are evaluated. Defender for Office 365, if you have it, adds Safe Links, Safe Attachments and extra phish checks on top. Transport rules and connectors run in Exchange Online as the message is accepted and delivered. Inbox rules run later, inside the mailbox.', learn: 'https://learn.microsoft.com/en-us/exchange/exchange-online', portals: ['licenses', 'accepted-domains'] },
  { id: 'path', title: 'The path of a normal message', body: 'The sender\'s server looks up your MX, which for a domain hosted here is a name ending in mail.protection.outlook.com. EOP checks the connecting IP, SPF, DKIM and DMARC, then spam and phish policies. Exchange applies transport rules and connectors, then delivers to the mailbox. The mailbox\'s inbox rules, forwards and delegates apply after that.', learn: 'https://learn.microsoft.com/en-us/exchange/mail-flow-best-practices/mail-flow-best-practices', portals: ['accepted-domains', 'connectors', 'message-trace'], where: 'The MX record lives at your DNS host, not in Microsoft 365.' },
  { id: 'auth', title: 'SPF, DKIM, DMARC, in that order', body: 'SPF says which servers may send. DKIM signs the content. DMARC says what to do when those two do not align with the From address, and where to send reports. p=none collects reports and does not ask receivers to quarantine or reject. Moving to quarantine or reject is a project, not a checkbox, because any system that sends as your domain (a survey tool, a scanner, a partner) has to be in SPF or DKIM first.', learn: 'https://learn.microsoft.com/en-us/defender-office-365/email-authentication-about', portals: ['spf-dmarc', 'dkim'], where: "SPF and DMARC are TXT records, and DKIM is two CNAME records, at whoever hosts the domain's DNS (your registrar, Azure DNS, Cloudflare and so on). Microsoft 365 only shows the values to publish. Turning DKIM signing on is done in the Defender portal." },
  { id: 'headers', title: 'How to read a header without guessing', body: 'Received lines are newest first. Read them bottom to top for the path. Authentication-Results is Microsoft\'s stamp of SPF, DKIM, DMARC and compauth. X-Forefront-Antispam-Report holds SCL, SFV, CAT, CIP and the country. X-Microsoft-Antispam holds BCL and PCL. The hop analyzer on this tool does that reading for you and keeps the result as data.', learn: 'https://learn.microsoft.com/en-us/defender-office-365/message-headers-eop-mdo', portals: ['message-trace', 'anti-spam', 'anti-phish'] },
  { id: 'rules', title: 'Transport rules versus inbox rules', body: 'A transport rule is tenant-wide and runs before delivery. An inbox rule belongs to one mailbox and runs after delivery. Both can forward mail. Only the transport rule can reject with an NDR. If a user says "I have a rule", ask which one. The mailbox pane lists both.', learn: 'https://learn.microsoft.com/en-us/exchange/security-and-compliance/mail-flow-rules/mail-flow-rules', portals: ['transport-rules', 'forwarding'] },
  { id: 'delegate', title: 'Full Access, Send As, Send on Behalf', body: 'Full Access opens the mailbox. Send As sends as the mailbox. Send on Behalf shows who sent it. A shared mailbox usually needs Full Access plus Send As. Outlook may take a while to show a newly delegated mailbox, and Autodiscover has to be right.', learn: 'https://learn.microsoft.com/en-us/exchange/recipients/mailbox-permissions', portals: ['delegation', 'mailboxes'] },
  { id: 'holds', title: 'Holds and retention', body: 'Litigation hold is a flag on the mailbox and needs Exchange Online Plan 2. A Purview retention policy can hold or delete content across mailboxes and is licensed with Microsoft 365. Retention hold pauses MRM processing. They are three different switches. Ex360 shows the mailbox flags and links to Purview for the policy.', learn: 'https://learn.microsoft.com/en-us/purview/retention', portals: ['retention-purview', 'ediscovery', 'retention'] },
  { id: 'client', title: 'Why the container cannot see Outlook', body: 'Ex360 runs in Docker on your PC. The container has its own disk. It cannot read your Windows profile, your OST file, or the Outlook COM object. The collector script runs in Windows PowerShell on the PC, as you, and posts a JSON summary to the container. It only reads.', learn: 'https://learn.microsoft.com/en-us/microsoft-365-apps/outlook/profiles-and-accounts/outlook-profile', portals: ['owa-mobile'], where: 'Outlook itself is configured on the PC (File > Account Settings). The portal below controls what Outlook on the web and mobile may do.' },
  { id: 'dlp', title: 'DLP test mode is not a block', body: 'A DLP policy has a mode. Test and TestWithNotifications tip or log. Enable can block. The policy also has workloads. If Exchange is not one of them, the policy never looks at mail. The mailbox page lists the policies that include Exchange and says whether this person is in scope. Message trace detail can show a DLP event, and some messages carry an X-MS-Exchange-Organization-Dlp header. The header does not say whether the policy was in test mode. Open the policy for that.', learn: 'https://learn.microsoft.com/en-us/purview/dlp-policy-design', portals: ['dlp'] },
  { id: 'holds-why', title: 'Three ways a mailbox is on hold', body: 'Litigation hold is a property of the mailbox and needs Exchange Online Plan 2. A Purview retention policy keeps or deletes content for a location, which can be every mailbox or a list. An eDiscovery case hold lists custodians. A mailbox can be on one, two, or all three. Ex360 lists each one and the reason it matches.', learn: 'https://learn.microsoft.com/en-us/purview/ediscovery-hold', portals: ['ediscovery', 'retention-purview', 'mailboxes'] },
];

// Sign-in failures for this app, not for a user's mailbox. Shown on Playbooks.
export const SIGN_IN_ERRORS = [
  {
    code: 'AADSTS7000218',
    title: 'Entra asked for a client secret',
    cause: 'The token request was rejected because Entra expected a client_secret or a client_assertion. That is what the Web platform does. Ex360 is a public client: it sends the authorization code and the PKCE verifier, and it never sends a secret.',
    fix: 'In the Ex360 app registration, delete every redirect URI on the Web platform. Put http://localhost:8360/auth/callback and http://localhost under Mobile and desktop applications (public client). Leave fallback public client enabled. Do not create a client secret.',
  },
  {
    code: 'AADSTS650053',
    title: 'Exchange.Manage was looked up on Microsoft Graph',
    cause: 'The Exchange hop asked for the scope Exchange.Manage. Entra looked for that name on Microsoft Graph, resource 00000003-0000-0000-c000-000000000000. Graph has no Exchange.Manage permission, so the sign-in stops. Exchange Online PowerShell requests https://outlook.office365.com/.default. That scope means the delegated permissions already configured on the app for Office 365 Exchange Online, including Exchange.Manage.',
    fix: 'Set EXO_SCOPE to https://outlook.office365.com/.default. If .env already exists, change it there. The environment value overrides the built-in default. Sign in again from the Exchange button. Do not add a client secret, and do not add a new Graph permission named Exchange.Manage.',
  },
  {
    code: 'Missing Exchange.Manage consent',
    title: 'The Exchange token has no admin consent',
    cause: 'The .default hop can finish without a consent prompt when the only oauth2PermissionGrant is Microsoft Graph. The access token then has no Exchange.Manage in scp. Ex360 reads that claim and does not call PowerShell. The same check applies to the compliance token: an empty scp means that resource was not consented either.',
    fix: 'In the Entra admin center, open the Ex360 app, API permissions, and choose Grant admin consent. Exchange.Manage (ab4f2b77-0b06-4fc1-a9de-02113fc2ab7c) is already on the registration. Then use Sign in again after consent. The card links to that blade.',
  },
  {
    code: 'UnAuthorized',
    title: 'PowerShell rejected the delegated token',
    cause: 'Connect-ExchangeOnline -AccessToken -Organization, and the same pair on Connect-IPPSSession, is the certificate and managed-identity path. Learn describes -Organization for CBA and managed identity. A delegated user token is paired with -UserPrincipalName. The module often returns only the word UnAuthorized.',
    fix: 'Ex360 passes the signed-in UPN as -UserPrincipalName. It uses -Organization only when that UPN is unknown. Open Details on the Not authorized card for the first 300 characters of the PowerShell error. The log line on the container is the same text, with the token removed.',
  },
];

export function lookupSignInError(text) {
  const blob = String(text || '');
  return SIGN_IN_ERRORS.find(row => blob.includes(row.code)) || null;
}

export const PLAYBOOKS = [
  {
    id: 'missing',
    title: 'Mail is not arriving',
    symptoms: 'The sender says they sent it. The recipient has nothing in Inbox or Junk.',
    steps: [
      'Ask whether the sender received a bounce. If yes, copy the status code and use the NDR playbook.',
      'Run a message trace for the sender, the recipient and the approximate time. If the trace is empty, Exchange Online never saw the message. Check the domain MX.',
      'If the trace shows Quarantined or Failed, open that event and the detail. Do not release anything from Ex360. Use the quarantine link.',
      'If the trace shows Delivered, the message is in the mailbox. Check Junk, an inbox rule that deletes, and a forward.',
    ],
    powershell: 'Get-MessageTraceV2 -RecipientAddress user@contoso.com -StartDate (Get-Date).AddDays(-2) -EndDate (Get-Date)',
  },
  {
    id: 'junk',
    title: 'Mail is in Junk',
    symptoms: 'The message was delivered, but Outlook put it in Junk Email.',
    steps: [
      'Get the headers from the message (File, Properties, or view source).',
      'Open Message hops and paste them. Read SFV, CAT, SCL and compauth before you change a policy.',
      'SFV:SKB or SKA means an admin allow or block list. SFV:SFE or BLK means the mailbox\'s own safe or blocked senders.',
      'A high BCL with CAT:BULK is the bulk threshold, not a spoof. Lowering the threshold is a tenant-wide change. Do it in the Defender portal, and only if you mean to.',
    ],
    powershell: 'Get-MailboxJunkEmailConfiguration -Identity user@contoso.com',
  },
  {
    id: 'ndr',
    title: 'An NDR with 5.7.x',
    symptoms: 'A bounce that mentions 5.7 and a sentence about authentication, relay, or DMARC.',
    steps: [
      'Copy the code, including the digits after 5.7.',
      'Read the matching row. 5.7.1 is three different errors. Use the sentence, not only the number.',
      '5.7.23 and 5.7.509 are DNS (SPF and DMARC). 5.7.520 is your outbound forwarding policy. 5.7.57 is a device that did not authenticate.',
      'Change the setting the row names. Ex360 links to the portal and shows the Get- command. It does not run a change.',
    ],
    powershell: 'Get-MessageTraceDetailV2 -MessageTraceId <id> -RecipientAddress user@contoso.com',
  },
  {
    id: 'spoof',
    title: 'Someone is spoofing our domain',
    symptoms: 'Mail that looks like it is from your domain, sent to your users or to the outside.',
    steps: [
      'Open Domains and DNS and read DMARC. p=none does not tell other systems to reject the spoof.',
      'Paste a sample into Message hops. CAT:SPOOF, SFTY 9.19 or 9.20, and compauth reason 000 or 010 are the usual stamps.',
      'List every system that sends as the domain before you move DMARC from none to quarantine. A missed include becomes your own outage.',
      'Impersonation policies need Defender for Office 365. If the license page says it is missing, EOP alone will not do that check.',
    ],
    powershell: 'Get-AntiPhishPolicy | Format-List Name, Enabled, EnableMailboxIntelligence, EnableOrganizationDomainsProtection',
  },
  {
    id: 'forward',
    title: 'Forwarding to an outside address was blocked',
    symptoms: 'NDR 5.7.520, or a forward that used to work and now does not.',
    steps: [
      'Confirm the forward is on the mailbox (ForwardingSmtpAddress) or in an inbox rule. The mailbox pane shows both.',
      'The outbound anti-spam policy blocks automatic external forwarding unless it is allowed. That is the usual cause of 5.7.520.',
      'Decide whether this mailbox should be an exception. Make the exception in the Defender portal, not by turning the feature on for the whole tenant without a reason.',
    ],
    powershell: 'Get-HostedOutboundSpamFilterPolicy | Format-List Name, AutoForwardingMode',
  },
  {
    id: 'shared',
    title: 'A shared mailbox is not in Outlook',
    symptoms: 'You granted access and the person still cannot see the mailbox, or can read but not send.',
    steps: [
      'Check Full Access and Send As separately. Full Access does not grant Send As.',
      'Auto-mapping adds the mailbox to Outlook for Full Access. It can take time, and it fails if Autodiscover is wrong.',
      'If they use Outlook on the web, they open the mailbox with "Open another mailbox". The desktop profile is a different path.',
      'The local Outlook collector shows the profile and Autodiscover result on their PC. The container cannot see that itself.',
    ],
    powershell: 'Get-MailboxPermission -Identity shared@contoso.com; Get-RecipientPermission -Identity shared@contoso.com',
  },
  {
    id: 'room',
    title: 'A room declined the meeting',
    symptoms: 'A resource mailbox accepted nothing, or accepted a conflict.',
    steps: [
      'Confirm the recipient type is a room or equipment mailbox, not a user who happens to have a calendar.',
      'Booking policy (AllBookInPolicy, BookInPolicy, RequestInPolicy) decides who can book without approval.',
      'AllowConflicts and MaximumDurationInMinutes are on the calendar processing settings. Ex360 shows them on the mailbox when Exchange returns them.',
      'Change them in the Exchange admin center or with Set-CalendarProcessing. Ex360 only shows the command.',
    ],
    powershell: 'Get-CalendarProcessing -Identity room@contoso.com | Format-List AutomateProcessing, AllBookInPolicy, BookInPolicy, AllowConflicts',
  },
  {
    id: 'delay',
    title: 'Mail is slow',
    symptoms: 'Messages arrive, but tens of minutes late.',
    steps: [
      'Check service health for Exchange Online before you look at one rule.',
      'Paste headers into Message hops. A delay over 15 minutes is called out on the hop that spent the time.',
      'A connector to a smart host can add that delay. The mail flow page lists connectors and whether they require TLS.',
    ],
    powershell: 'Get-MessageTraceV2 -RecipientAddress user@contoso.com -StartDate (Get-Date).AddHours(-12) -EndDate (Get-Date)',
  },
  {
    id: 'quarantine',
    title: 'The message is quarantined',
    symptoms: 'The user cannot find it, and message trace says Quarantined.',
    steps: [
      'Open the quarantine in the Defender portal from the link on the security page. Releasing is a change, so Ex360 does not do it.',
      'Read which policy quarantined it (spam, phish, malware, bulk). The hop analyzer CAT value is the same vocabulary.',
      'If end users cannot release, that is the quarantine policy, not a missing licence.',
    ],
    powershell: 'Get-QuarantineMessage -RecipientAddress user@contoso.com',
  },
  {
    id: 'dkim',
    title: 'DKIM fails after a signature service',
    symptoms: 'DKIM passed at the sender and failed when it arrived, and a disclaimer or signature product is in the path.',
    steps: [
      'A change to the body breaks the DKIM body hash. compauth reason 108 is the usual stamp when an earlier hop edited the body.',
      'Either the signature service re-signs DKIM, or it sits where it does not edit mail you need to authenticate.',
      'ARC (cv=pass from a trusted sealer) is how a legitimate middle hop can keep the earlier result. cv=fail means that voucher did not hold.',
    ],
    powershell: 'Get-DkimSigningConfig -Identity contoso.com | Format-List Enabled, Status, Selector1CNAME',
  },
  {
    id: 'dlp-tip',
    title: 'DLP blocked or tipped my email',
    symptoms: 'The sender got a tip, or the message never arrived, and someone mentions a policy or sensitive information.',
    steps: [
      'Open DLP and read the mode. TestWithNotifications tips the sender and does not block. Enable can block.',
      'Confirm the policy includes the Exchange workload. A SharePoint-only policy did not do this.',
      'Open the mailbox and Compliance on this mailbox. The why column says whether the person is in the policy scope.',
      'If you have the message, paste the headers into Message hops. A DLP header or a DLP event in trace detail is called out in plain words. The header does not say the mode.',
    ],
    powershell: 'Get-DlpCompliancePolicy | Format-Table Name, Mode, Workload',
  },
  {
    id: 'on-hold',
    title: 'Is this mailbox on hold, and why',
    symptoms: 'Someone asks whether a mailbox is on hold, or content that should have expired is still there.',
    steps: [
      'Open the mailbox. Litigation hold and retention hold are flags on the mailbox. Plan 2 is required for litigation hold.',
      'Open Compliance on this mailbox. Retention policies that include Exchange, and eDiscovery holds that name this address, are listed with the reason.',
      'A disabled policy and a policy that excludes this mailbox are listed too, and the why column says they do not apply.',
      'Changing a hold is done in Purview or the Exchange admin center. Ex360 only reads.',
    ],
    powershell: 'Get-Mailbox -Identity user@contoso.com | Format-List LitigationHoldEnabled, RetentionHoldEnabled, RetentionPolicy; Get-ComplianceCase | Format-Table Name, Status',
  },
];

export const ONPREM = {
  title: 'On-premises Exchange',
  status: 'Not in this version',
  body: 'Ex360 v1 reads Exchange Online only. On-premises Exchange (queues, mailbox databases, receive connectors on a server, and message tracking logs on that server) needs a later version and a way to reach those servers from the machine that runs this container. Hybrid mail flow that already arrives in Exchange Online shows up here as connectors and as hops. The servers themselves do not.',
  later: ['Queue viewer and poison queues', 'Receive connectors on Mailbox servers', 'Message tracking logs on the server', 'Edge Transport', 'Public folders'],
};
