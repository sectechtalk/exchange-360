# Job coverage

What Exchange 360 shows for an Exchange Online and Purview engineering job, and what it does not. For each item: where the current configuration is read, and how Exchange 360 helps troubleshoot it. Exchange 360 only reads. Every change is made in the portal it links to, after your change process.

"Live" means the page reads the signed-in tenant with the person's own permissions. Every page also runs on fictional Contoso demo data. A read the person's role does not allow says **Not authorized**; a feature the tenant is not licensed for says **License required**.

## Exchange Online configuration

| Job item | Current configuration (live) | Troubleshooting help |
| --- | --- | --- |
| Mail flow and transport rules | Mail flow rules: every rule in run order with Exchange's own description of conditions and actions, mode, stop processing, expiry. | Config review flags rules that skip spam filtering (SCL -1) on a spoofable sender, rules in test mode, disabled or expired rules, rules that copy or redirect mail. Trace a message names the rule that acted on a message. Everything for one recipient says which rules apply to a person and why. |
| Connectors | Connectors: type, sender domains and IPs, TLS, certificate or IP restriction, Enhanced Filtering, smart hosts, rule-scoped. | Config review flags partner connectors that trust a domain alone, opportunistic TLS, and a gateway in front of Exchange Online without Enhanced Filtering. |
| Accepted domains | Domains and DNS: Exchange domain type (authoritative, relay) and default, plus Entra verification and live DNS. | Config review explains relay domains and an MX that does not point at Exchange Online. |
| Remote domains | Domains and DNS: auto-forward, automatic replies, out-of-office type per remote domain. | Config review checks the Default remote domain and the outbound spam policy together for external forwarding. |
| Distribution groups and shared mailboxes | Recipients: groups with owners, member counts, outside-sender setting, moderation, joining; dynamic and Microsoft 365 groups; shared mailboxes with Full Access counts and whether direct sign-in is blocked. Per user: membership and delegation. | Config review flags shared mailboxes that allow sign-in or have no one with access, groups with no owner, large groups open to the internet, public Microsoft 365 groups. |
| Resource mailboxes | Recipients: room and equipment mailboxes, capacity, and booking rules in plain words (auto-accept, who can book, delegates, conflicts, window). | Config review flags rooms that do not auto-accept, accept nobody, or allow double booking. Playbooks has the room booking fix. |
| Retention and mailbox policies | Org config: Exchange MRM policies and tags, Outlook on the web, mobile device and sharing policies. Retention (Compliance): Purview retention policies and labels. | Config review flags a default tag that deletes mail, no Purview retention for Exchange, retention policies not distributed, anonymous calendar sharing. Everything for one recipient shows the MRM policy, holds and Purview policies on one person. |
| Permissions and delegation | Recipient pane and Everything for one recipient: Full Access, Send As, Send on Behalf. Admin roles: Entra roles and Exchange role groups. Compliance admin: Purview role groups and members. | Everything for one recipient explains who can open or send as a mailbox. |

## Exchange Online security

| Job item | Current configuration (live) | Troubleshooting help |
| --- | --- | --- |
| Anti-spam and anti-phishing | Security policies: every anti-spam and anti-phishing policy with settings in plain words and who it applies to; preset policies; connection filter; tenant allow entries. | Config review flags allowed sender domains, IP allow lists, phish to Junk, high-confidence phish not quarantined, ZAP off, presets off. Message hops explains SCL, BCL, SFV and CAT on one message. |
| Defender for Office 365 integration | Security policies and Licenses: preset Defender policies, Built-in protection, global Safe Attachments settings. | Config review says when a feature needs a license, and checks the settings when it is licensed. |
| Safe Links and Safe Attachments | Security policies: each policy's settings and scope. | Config review flags click-through, no real-time scanning, internal senders skipped, Safe Attachments set to Allow or off. |
| Impersonation and spoofing protection | Security policies: spoof intelligence, DMARC honouring, user and domain impersonation, mailbox intelligence. | Config review flags spoof intelligence off and impersonation protection not configured. Message hops separates spoofing (CAT SPOOF) from impersonation (SFTY 9.19 and 9.20). |
| Mail flow security | Connectors, Security policies (outbound spam), Domains and DNS (MTA-STS, TLS-RPT). | Config review covers TLS on connectors, external forwarding, mailboxes forwarding to outside addresses. |
| Authentication and modern authentication controls | Org config: modern authentication, SMTP AUTH, authentication policies per protocol. Conditional Access (per user). | Config review flags modern auth off, SMTP AUTH on for everyone, basic auth allowed in a policy, and no Conditional Access policy requiring MFA or blocking legacy authentication for Exchange. |
| SPF, DKIM and DMARC | Domains and DNS: live SPF, DKIM CNAMEs and DMARC for every domain, and DKIM signing status in Exchange Online. | Config review flags missing SPF or DMARC, +all, over 10 lookups, DMARC p=none, DKIM not signing. Message hops checks SPF, DKIM, DMARC, ARC and composite authentication on one message, including alignment. |

## Operations

| Job item | Current configuration (live) | Troubleshooting help |
| --- | --- | --- |
| Troubleshoot mail flow, authentication and delivery | Trace a message, Message hops, Quarantine. | Trace by sender, recipient or message ID; Explain reads every event and says what happened, the NDR code, the rule or policy involved and what to check next. Quarantine says why a message is held and who can release it. |
| Monitor service health | Service health (Graph service announcements). | Config review puts an Exchange or Defender incident at the top, so nobody troubleshoots the tenant during a Microsoft outage. |
| Monitor message flow | Trace a message (organization-wide, last 10 days per search) and Message trace per mailbox. | Status in plain words for every row. |
| Monitor security events | Defender XDR (incidents and alerts per mailbox), Quarantine, Audit search. | Quarantine summary by reason. |
| Operational performance | Hop delays on Message hops. | Not a performance dashboard. Exchange 360 has no mail-flow volume or latency charts. |
| Work with Microsoft support | Support links on Migrations and Defender XDR. Config review's Markdown download is evidence for a case. | |
| Runbooks and knowledge articles | Playbooks, Learn, Config review (each finding carries the next step). | Download as Markdown turns the review into a document. |
| Change management, implementation planning, testing | Change history (Exchange admin audit log, Entra directory audit). Config review gives the before state for a change. | Test modes are called out for mail flow rules and DLP. |
| Governance and lifecycle | Recipients (owners, orphaned shared mailboxes), Retention, eDiscovery, Audit. | Config review covers owners, retention coverage and audit. |

## Microsoft Purview

| Job item | Current configuration (live) | Troubleshooting help |
| --- | --- | --- |
| Data Loss Prevention | DLP: policies (mode, workloads, scope, distribution) and rules (sensitive information types, block, notify, severity). | Config review flags no DLP for Exchange, test mode, distribution not Success, blocks without notification. The DLP page lists the steps for a DLP match, and Trace a message names the DLP policy on a message. Compliance on this recipient says which policies apply to a person. |
| Information Protection and sensitivity labels | Sensitivity labels: labels and label policies with distribution. | Config review flags labels that no policy publishes and policies not distributed. |
| Retention policies and retention labels | Retention: Purview retention policies (duration, scope, distribution) and labels. | Config review flags no retention for Exchange. Everything for one recipient says which policy applies and why. |
| eDiscovery | eDiscovery: cases and holds. | Everything for one recipient and Compliance on this recipient show holds on a person. |
| Audit and compliance investigations | Audit: unified audit on or off, and a read-only search by user, operation and date. Change history. | Config review flags unified audit or mailbox auditing off. |
| Compliance portal administration | Compliance admin: Purview role groups and members. | |
| DLP policy design, implementation, testing, troubleshooting | DLP page. | Design and implementation stay in the Purview portal. Exchange 360 does not create or change a policy. |

## Neighbouring skills

| Job item | Exchange 360 page | Notes |
| --- | --- | --- |
| Preferred: Entra ID | Admin roles, Conditional Access, Change history | Directory roles, Conditional Access for Exchange, directory audit. |
| Preferred: Defender XDR | Defender XDR | Incidents and alerts for a mailbox, read-only, with portal links. |
| Preferred: Conditional Access | Conditional Access, Config review | Policies that include Exchange Online, Office 365 or all apps, and whether MFA is required and legacy auth blocked. |
| Preferred: Microsoft Graph | Sign-in, docs/auth.md | Delegated Graph reads only. |
| Preferred: Exchange Online PowerShell | Every organization and mailbox page, with the `Get-` command on each | Read-only `Get-` and `Search-` cmdlets. No `Set-`. |
| Preferred: Teams | Not covered | Out of scope for an Exchange tool. |
| Preferred: SharePoint Online | Not covered | Out of scope. A SharePoint-only DLP policy is shown so you can see it does not apply to mail. |
| Preferred: OneDrive | Not covered | Out of scope. |
| Preferred: Intune | Not covered | Out of scope. |

## Not covered

- Making any configuration change. Exchange 360 v1 is read-only by design.
- Teams, SharePoint, OneDrive and Intune configuration.
- On-premises Exchange (placeholder page).
- Historical message trace beyond one 10-day search (Start-HistoricalSearch is not used).
- An AI chat about a message (deliberately left out of v1).
