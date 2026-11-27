# Exchange 360

**A free, local troubleshooting and administration dashboard for Exchange Online.**

Exchange 360 (Ex360 for short) runs in a Docker container on your own PC. You sign in with your own Microsoft 365 account, and it shows you how your Exchange Online organization is set up and why one mailbox or one message behaves the way it does. It is written for someone who has just been handed Exchange Online and needs to understand it fast, and for the engineer who has to answer "why didn't my email arrive?" by lunchtime.

It is the Exchange member of the SecTechTalk 360 family, next to Federation 360, Certificates 360 and Entity 360.

## Where the project stands

This is version 1. Be clear about what is finished and what is not.

| Status | What |
| --- | --- |
| **Built and tested** | 66 pages (listed below), including a Setup steps page that checks every prerequisite live, a **Config review** that checks every area of the tenant in plain words, a **Single recipient** view with a one-click PDF report that works for every recipient that can receive email, message trace with every event explained, a read-only quarantine view, a deterministic message-header analyzer, live DNS checks, Contoso sample data used only by the automated tests (the app itself has no demo mode; signed out, pages ask you to sign in), one Sign in that connects Graph, Exchange Online, Purview Graph and Security & Compliance PowerShell together, with automatic token renewal, NextHop (a mail flow predictor that works from configuration only, with a Mail flow lanes diagram that lights up the route a test message takes, and a form you can fill from a real message's headers), a read-only mail flow configuration export, Config snapshots that save that export and compare any two, a read-only MCP server for AI clients, and more than 900 automated tests that pass (9 of them run only where PowerShell 7 is installed). A test fails the build if any page tries to send anything other than a read (GET) request. |
| **Run against a real tenant** | On 17 November 2026, after admin consent was granted, Ex360 ran against a real Microsoft 365 tenant under the owner's own sign-in: sign-in to Graph, Exchange Online, Purview Graph and Security & Compliance PowerShell all connected, every Setup steps check passed (including a live Exchange Online PowerShell connection), and the Org summary page (since removed; Licenses and Service health show the same data) showed live licenses, domains and service health. Since then, under the same sign-in: **Trace a message** returned live results and its details panel showed the real events and the mail flow rule that acted (20 November 2026). The DNS-over-HTTPS fallback returned both DKIM selectors for a real domain from inside the container (22 November 2026). The **mail flow configuration export** made its first live run (22 November 2026): 67 sections, 47 read with data, 18 empty and 2 errors; the 2 errors (eDiscovery holds must be read case by case) were fixed, and the fixed script was re-run live on 26 November 2026: 67 sections, 47 read with data, 20 empty and 0 errors. NextHop opened that export in a browser and ran an inbound and an outbound prediction from it (27 November 2026); whether each prediction matches what Exchange Online really does has not been confirmed. The **MCP server** answered from Claude Code end to end (22 November 2026). The 22 admin portal links NextHop uses were opened in a browser signed in to the tenant and the 5 broken ones fixed, and the column names of 15 tables were compared with the live portal pages (both 22 November 2026; this checks the portal, not Ex360's data). |
| **Built, not yet checked on a real tenant** | The other Organization, Compliance, Single recipient and Troubleshoot pages, including Config review, Recipients, Trace a message and Quarantine (added 19 November 2026), the mailbox PDF report, and Single recipient for Microsoft 365 groups, distribution lists, mail contacts and mail users (added 21 November 2026), the Exchange Online search that adds dynamic distribution lists, room lists and mail-enabled public folders (added 21 November 2026), the Sign-ins fix for Graph's UnknownError (added 22 November 2026), NextHop with **Read my live tenant** (added 22 November 2026), NextHop's Mail flow lanes and **Fill it from a real message** (added 25 November 2026), the six Single recipient pages added 25 November 2026 (Licenses and service plans, Calendar and folder permissions, Mobile devices, Message trace, Quarantine and Admin changes), and Config snapshots (added 26 November 2026). Their PowerShell reads ran against stub cmdlets, not a real tenant. They use the same sign-in and the same kind of read-only calls, and every part has been tested against demo data shaped like the real output, but each has not yet been opened against real tenant data. Anything the signed-in person cannot read shows a **Not authorized** label. |
| **Planned, not built** | Making configuration changes (v1 only reads). On-premises Exchange (the page is a placeholder). An AI chat about each message hop (deliberately left out of v1). Scheduled config snapshots, and deleting a snapshot from the page (delete the file instead). |

## What it does

Ex360 has two main views, and every other page feeds into one of them.

- **Org view.** The whole Exchange Online organization, starting at the top: which Microsoft 365 licenses you own and their status, then domains, mail flow, recipients, security policies, configuration and service health.
- **Config review.** One page that checks the whole tenant: SPF, DKIM and DMARC for every domain, mail flow rules (including rules that skip spam filtering), connectors and Enhanced Filtering, anti-spam, anti-phishing, spoofing and impersonation, Safe Links, Safe Attachments and malware, external forwarding, modern authentication and SMTP AUTH, Conditional Access for Exchange, groups and shared and resource mailboxes, retention, DLP, labels, eDiscovery, audit, quarantine policies and service health. Each line says what is configured, why it matters and what to check next, with the portals that change it. **Download as Markdown** saves the result for a ticket or a change request.
- **Single recipient.** Anything that receives inbound mail for the organization, picked from a search laid out like the Exchange admin center (Display name, Email address, Recipient type): user, shared, room and equipment mailboxes, Microsoft 365 groups, distribution lists, mail-enabled security groups, dynamic distribution lists, room lists, mail contacts, mail users and mail-enabled public folders. Graph finds most of them; an Exchange Online search (Get-Recipient) adds the ones Graph does not list. The **Recipient** page shows who it is, every address that delivers to it, delivery settings (who may send to it, automatic replies), and for a group its owners, members and delivery management. For a mailbox it adds account and licenses and the mailbox limits, and **Download PDF report** or **Download MHTML report** gives the full read as a PDF or as one self-contained web page (.mhtml, opens in Edge, Chrome or Word), built in memory and never saved by Ex360. Forwarding, Inbox rules, Member of, Delegation and Protocols say whether your own Exchange role lets you make the change their portal link makes (Ex360 asks Get-Command which cmdlets and parameters your role includes; nothing is run). Everything else has its own page and is not repeated on Recipient: Forwarding, Inbox rules (with junk email settings), Delegation, Member of, Policies that apply (live mail flow rules, protection policies and connectors for a mailbox), Protocols, Sign-ins (the last 10, with Show all), Findings, Compliance on this recipient, Conditional Access and Defender XDR. Pages that do not apply to the open recipient, such as Inbox rules for a distribution list, are marked **N/A** in the left pane and say why. Anything you are not allowed to read says **Not authorized** instead of being left out.

**Message hops** is the third main piece. Give it a message and it walks through every server the message passed through, then explains in plain words what SPF, DKIM, DMARC, ARC, composite authentication, the spam and phishing verdicts, and any transport rule or DLP hit did to it. The same headers always give the same answer. Four ways to give it a message:

1. Paste the message headers.
2. Drop a `.eml` or `.msg` file (read in your browser, never uploaded).
3. Run a message trace by sender, recipient, Message-ID or subject.
4. Read the headers straight from a mailbox through Microsoft Graph.

**Download redacted copy** keeps the verdicts and hops and removes email addresses and IP addresses, so you can share the result safely.

Every setting links to each admin portal that can change it (Exchange admin center, Microsoft 365 admin center, Defender, Purview and Entra), most direct first, and shows the read-only PowerShell `Get-` command that returns it.

## Pages

Grouped the way the app's menu groups them.

### Setup

| Page | What it does |
| --- | --- |
| Setup steps | Every one-off setting Ex360 depends on (the `.env` values, the app registration's redirect URIs and public client setting, each permission and its admin consent, your active role, PowerShell in the container, and a real Exchange Online connection), each checked live with your own sign-in. Each check shows pass or fail in plain words, plus the exact fix and a direct Entra link. It only reads, and never changes the tenant. The same list is written down in [docs/setup.md](docs/setup.md). |

### New hire

| Page | What it does |
| --- | --- |
| Start here | What Exchange Online is, the first 15 minutes, and a three-week learning path. |
| License, Roles and Permissions | The license, roles, role groups and permissions each feature needs, one labeled line each, with the Microsoft Learn article. |
| Someone just asked | Common ticket sentences, and the page that answers each one. |
| Glossary | The Exchange words, in plain English, in one table you can filter by category, search and sort. |
| Learn | Short explanations of how mail flow, authentication and protection work. |
| Playbooks | Step-by-step fixes: mail not arriving, mail in junk, 5.7.x bounce codes, spoofing, forwarding, shared mailboxes, room booking, DLP policy tips, holds, and sign-in errors. |

### Organization

| Page | What it does |
| --- | --- |
| Config review | Every area of the tenant checked in plain words (see above). |
| Service health | Exchange Online health and Microsoft service messages, the Microsoft 365 admin center Service health and Message center, and the public Microsoft 365 status, Azure status and Azure Service Health pages, with when to use each. |
| Mailboxes > Shared mailboxes, Room and equipment mailboxes, Mailboxes that forward | One page each, each a single table with a search box and a sort and search menu on every column. |
| Mail-enabled groups > Distribution and mail-enabled security groups, Dynamic distribution groups, Microsoft 365 groups | One page each, each a single searchable table, laid out like the Exchange admin center list. |
| Mail flow rules | The same list as the Exchange admin center's Mail flow > Rules page, in its columns (Status, Rule, Priority, Stop processing rules, Size, Last execution, Configuration supported, Unsupported reason). Selecting a rule opens its conditions, actions, exceptions and settings, with warnings for test mode, stop processing and spam-filter bypass. |
| Security policies | Which policy wins for a person (presets, then custom policies by priority, then the default), with a button for each policy page below. |
| Security policies > Anti-spam, Anti-phishing, Anti-malware, Safe Links, Safe Attachments, Outbound spam and forwarding, Connection filter and allow list, Quarantine policies | One page each: every policy of that kind with its settings in plain words and who it applies to, the connection filter and tenant allow entries, and quarantine policies. If a license is missing, the page names the one that would unlock it. Anti-spam links open https://security.microsoft.com/antispam and quarantine policy links open https://security.microsoft.com/quarantinePolicies. |
| Domains and DNS | Accepted and remote domains, plus a live check of MX, SPF, DKIM, DMARC, MTA-STS, TLS-RPT and Autodiscover records. |
| Connectors | Inbound and outbound connectors: type, sender domains and IPs, TLS, certificate or IP restriction, Enhanced Filtering, smart hosts. |
| Org config | Modern authentication, SMTP AUTH, authentication policies per protocol, audit settings, the External tag, message size limits, Exchange retention (MRM) policies and tags, Outlook on the web, mobile device and sharing policies. |
| Licenses | Plans owned (E3, E5, Defender for Office 365 Plan 1 and 2, Exchange Online plans), seats used, and each subscription's status (Enabled, Warning, Suspended, Deleted or Locked out). |
| Migrations | Migration endpoints, batches and move requests. |

### Organization > Access and assignments

| Page | What it does |
| --- | --- |
| User roles | Role assignment policies laid out like Exchange admin center > Roles > User roles. Select one to see what people with it may change for themselves, in plain words. |
| Admin roles | Exchange role groups laid out like Exchange admin center > Roles > Admin roles (select one for its roles, members and managers), and the Microsoft Entra roles that reach Exchange Online, with what each one gives there. |
| Role assignments and scopes | Every Exchange management role assignment, split into direct assignments, role groups, applications and user roles, with its write scope, plus the management scopes. No portal page shows this in one place, so it follows the cmdlet output. |
| App access | RBAC for Applications: service principals in Exchange Online and the mailbox roles and scopes each app holds, plus legacy application access policies. |

### Organization > Compliance (Microsoft Purview)

A collapsible group under Organization. Every page here is organization-wide; the per-recipient view is Single recipient > Compliance on this recipient.

| Page | What it does |
| --- | --- |
| DLP | Data loss prevention policies and rules: mode, workloads, scope, distribution status, which sensitive information types each rule looks for, whether it blocks and who it notifies, plus the steps to troubleshoot a DLP match. |
| Sensitivity labels | Labels and the policies that publish them. |
| Retention | Retention policies and retention labels. |
| eDiscovery | Cases and their holds. |
| Compliance admin | Purview role groups and their members. |

### Organization > Auditing/Logging

| Page | What it does |
| --- | --- |
| Audit | Whether the unified audit log is on, and a read-only search by user, operation and date. |
| Change history | Who changed Exchange configuration, and recent Entra directory audit events. |
| Config snapshots | One click saves every mail flow setting (the read-only export, secrets removed) to `%USERPROFILE%\Ex360-snapshots` on your PC, or to an optional snapshot store you run. Lists snapshots and export files, and compares any two: how many sections differ, and under each section that differs the objects added, removed or changed, with each property before and after. Values that change on their own (sizes, counters, last logon times) are left out of the compare. Use it before and after a change, or to see what someone changed. See [docs/snapshots.md](docs/snapshots.md). |

### Single recipient

| Page | What it does |
| --- | --- |
| Recipient | One recipient (see above): General, Email addresses, delivery settings, and for a group its owners, members and delivery management. For a mailbox, account and licenses, mailbox limits, **Download PDF report** and **Download MHTML report**. Trace mail received and Trace mail sent open Trace a message with the address filled in, for the last 10 days. |
| Licenses and service plans | Every license on the user, whether it was assigned directly or through a group, and every service plan inside it with its status. |
| Forwarding, Inbox rules, Delegation, Member of, Policies that apply, Protocols, Sign-ins, Findings | One page each. Sign-ins shows the last 10, with Show all. Pages that do not apply to the recipient type say so. |
| Calendar and folder permissions | Who can see or edit the mailbox's Calendar and other folders, folder by folder (Get-MailboxFolderPermission). Default and Anonymous with no rights are hidden except on the Calendar. |
| Mobile devices | Phones and tablets that sync with the mailbox: device, model, OS, app, whether Exchange allows, blocks or quarantines it, and first sync, laid out like the Exchange admin center. |
| Message trace | Mail this recipient sent and received in the last 10 days (Get-MessageTraceV2). |
| Quarantine | Messages held in quarantine for this recipient in the last 30 days, why each was held, and who can release it. Read-only. |
| Admin changes | Changes admins made to this recipient: Exchange settings from the admin audit log (last 90 days) and Microsoft Entra audit log events. |
| Compliance on this recipient | Which DLP policies, retention policies and eDiscovery holds apply, and why. |
| Conditional Access | Which Conditional Access policies cover Exchange Online for this user. |
| Defender XDR | Security incidents and alerts for this mailbox. |
| NextHop | Predicts what Exchange Online would do with one test message, inbound or outbound, from configuration only: every step in the order Exchange Online applies it (accepted domain, inbound connector, connection filter, Tenant Allow/Block List, anti-malware, mail flow rules, DLP, anti-phishing, anti-spam, Safe Attachments, Safe Links, journaling, retention and holds, the mailbox's junk settings, inbox rules and forwarding; outbound adds the outbound spam policy, auto-labeling, remote domains, DKIM and the outbound connector), what happens and why, and the setting that caused it, with a link to each portal that changes it. Each step links to the admin portal page where its setting is configured. **Mail flow lanes** draws the configuration as one numbered column for each place an object acts, inbound or outbound, in the order Exchange Online applies them; after a prediction the objects that acted light up and a line joins them in step order. **Topology at a glance** shows every area the export holds and whether the prediction uses it. **Fill it from a real message** reads a pasted header block or a .eml or .msg file and fills the test message (direction, sending IP, authentication result, spam verdict, subject and attachments), saying where each value came from. It reads the recipient open on Recipient from the live tenant, the built-in **Contoso sample topology** (fictional, opened only when you choose it), an export of your tenant made by `export/Export-MailFlowConfig.ps1` (opened in the browser, never uploaded), or **Read my live tenant**, which runs the same read-only export inside the container with your own sign-in, in the background, with progress and a Windows notification when a long read finishes. The outside address is made up, so there is no DNS: its sending IP, authentication result and the spam verdict are values you choose. 14 ready-made examples. **Change this check** and **New check** follow a prediction, and the open configuration and form survive a refresh (kept in the browser on your PC). **Download report (.mhtml)** saves the prediction as one file that opens in Edge. Not yet confirmed against a real tenant's configuration. See [docs/nexthop.md](docs/nexthop.md). |

### Troubleshoot

| Page | What it does |
| --- | --- |
| Trace a message | Message trace by sender, recipient, message ID or subject for up to 10 days, laid out like the Exchange admin center. Selecting a row opens a details panel: each event with the time since the previous one, the mail flow rule or DLP policy that acted (name, ID, action taken, with a link to that rule), the spam verdict when present, More information (Message ID, size, From IP, To IP, direction, message trace ID, receiving server, delivered folder), every related record with the same Message ID, what to check next, and the exact PowerShell with the real values. A failed read shows as an error, never as "No messages matched". |
| Quarantine | What is held in quarantine, why (spam, bulk, phish, malware, a rule), which policy held it and who is allowed to release it. Read-only; releasing stays in the Defender portal. |
| Message hops | The hop-by-hop analyzer described above. |
| Outlook on this PC | A read-only Windows script that reports the Outlook version and update channel, profiles, OST and PST file sizes, add-ins, and an Autodiscover and network check. The container can't see your Windows profile, so the script runs on the PC and sends the results to the container. |

### On-premises

| Page | What it does |
| --- | --- |
| On-premises | Placeholder. On-premises Exchange is not in v1. |

## Permissions and safety

- **Looks like the Microsoft admin portals.** The layout, Segoe UI font, spacing and tables follow the Azure portal and the Microsoft 365 admin center (Fluent UI), in light and dark. Table rows are striped. Buttons are filled, never the page colour, and a disabled button is grey with a dashed border.
- **Tables work like the admin portals.** Every column header opens a menu with Sort A to Z, Sort Z to A and a search box for that column. Tables use the portal's exact column names and default columns (mapped in [docs/portal-columns.md](docs/portal-columns.md)), facts that are not portal columns sit in the row's details panel, and selecting a row opens its details. Recipient, group and log pages wait for a search instead of loading everything; an empty result explains what the page lists and where else to look.
- **Every object links to the portals that change it.** Each object in a table links straight to its own page in every portal that can change it (for a user, the Microsoft 365 admin center and Entra at least). Where a portal has no direct link, a "find it here" link opens its list page and names the object. Every pane has an **Open in portal** button under its heading. The home portal (the service that stores the object) comes first, filled solid and labelled **Home:**, and object panels show the PowerShell `Get-` command that returns every setting.
- **Every section folds, and starts folded.** Every pane on every page can be collapsed, and each page visit starts with every pane collapsed, so a page opens as a short list of headings. Pages with two or more panes have **Expand all sections** and **Collapse all sections**. The left menu opens only the group that holds the current page.
- **Every button shows it is working.** A clicked button says what it is doing (Reading, Searching, Building the report) until it finishes, and report downloads show progress. A failed call says in plain words what happened, with the request ID and the raw answer under Details, instead of a blank table.
- **You only see what you are allowed to see.** Ex360 signs in as you through the normal Microsoft sign-in page, so your multi-factor authentication and Conditional Access rules apply, and it uses delegated permissions only. A page you don't have the role for says **Not authorized** and names the missing permission or role, instead of showing an empty table.
- **AI tools are read-only too.** The built-in MCP server ([docs/mcp.md](docs/mcp.md)) lets Claude desktop or Claude Code call what Ex360 reads, with your browser sign-in and your permissions. It has no tool that changes anything, and it is reachable only through `docker exec` on your PC.
- **It does not change your tenant.** Every page is read-only, and a test enforces it. The only write is the Outlook script sending its report to the container on your own PC.
- **No secrets.** The app registration is a public client with no client secret and no certificate. Tokens live only in the server's memory and are never written to disk.
- **No cost.** Nothing in the app needs a paid Azure resource. Some pages need a Microsoft 365 license your tenant may already have (for example, Defender for Office 365 for Safe Links), and the page says which.

## What Ex360 sends, and where

| Sent to | What | When |
| --- | --- | --- |
| Microsoft Entra ID (`login.microsoftonline.com`) | Your sign-in, and token requests for Graph, Exchange Online and Purview | When you sign in, and when a token is refreshed |
| Microsoft Graph (`graph.microsoft.com`) | Read requests for licenses, domains, users, groups, sign-ins, Conditional Access, service health, security alerts and message headers | When a page loads, after sign-in |
| Exchange Online PowerShell (`outlook.office365.com`) | Read-only `Get-` and `Search-` commands | When an Exchange page loads, after sign-in |
| Security & Compliance PowerShell (`ps.compliance.protection.outlook.com`) | Read-only Purview `Get-` and `Search-` commands | When a Compliance page loads, after sign-in |
| Public DNS (`1.1.1.1` and `8.8.8.8`, with DNS-over-HTTPS to `cloudflare-dns.com` and `dns.google` when that returns nothing) | Lookups for MX, SPF, DKIM, DMARC, MTA-STS, TLS-RPT and Autodiscover records for your domain names | On Domains and DNS and Config review |
| Nowhere | Pasted headers, dropped `.eml` or `.msg` files, and NextHop export files and test messages | Analyzed locally. The pages never send them to a language model or any outside service. |
| The AI client you connect, and its language model (only if you connect one) | Whatever an MCP tool returns: configuration, recipients, sign-ins, trace and quarantine rows, headers | Only when the AI client calls an Exchange 360 MCP tool. See [docs/mcp.md](docs/mcp.md). |
| A snapshot store you run (only if you set one up in `.env`) | Each config snapshot you take, with your own sign-in token for that store | Only when you click **Take snapshot**, or list or compare snapshots. Without one, snapshots stay in a folder on your PC. |
| Your browser only | The Single recipient PDF and MHTML reports, and the NextHop .mhtml report | Built in memory when you click a download button. Ex360 does not keep a copy. It holds tenant data, so store it like any confidential file. |

## Run it on Windows

You need [Docker Desktop](https://www.docker.com/products/docker-desktop/) and [Git](https://git-scm.com/download/win). In PowerShell 7:

```powershell
git clone https://github.com/sectechtalk/exchange-360.git
cd exchange-360
.\Start-Ex360.ps1
```

The first run copies `.env.example` to `.env`, then builds and starts the container. The script opens **http://localhost:8360/#setup**, the Setup steps page. Always use `localhost`, not `127.0.0.1`, or the browser loses the sign-in cookie. Click **Sign in** once to connect Graph, Exchange Online, Purview Graph and Security & Compliance PowerShell. There is no demo mode: signed out, tenant pages ask you to sign in. The Learn pages work without signing in, and NextHop's fictional Contoso sample topology opens only when you choose it.

| Command | What it does |
| --- | --- |
| `.\Stop-Ex360.ps1` | Stops the container. |
| `docker compose logs -f exchange-360` | Shows the log. |
| `npm test` | Runs the tests without Docker (needs Node.js 22). |

The site listens on `127.0.0.1` only, so nothing outside your PC can reach it. The image includes Node.js 22, PowerShell 7 and the ExchangeOnlineManagement module.

To connect your own tenant, follow [docs/setup.md](docs/setup.md): register a single-tenant app in Entra as a public client, put its tenant and client IDs in `.env`, grant admin consent, then open Setup steps to confirm each piece. How sign-in works is in [docs/auth.md](docs/auth.md).

## Built with

Node.js 22 (no third-party runtime packages), plain HTML, CSS and JavaScript, PowerShell 7 with ExchangeOnlineManagement, Microsoft Graph, and Docker. The `security` workflow runs `npm audit`, a gitleaks secret scan, the tests and a syntax check on every pull request.

## More

- [docs/setup.md](docs/setup.md): every one-off setting, in order, with what success looks like.
- [docs/auth.md](docs/auth.md): how sign-in works, token renewal, and the permissions it asks for.
- [docs/job-coverage.md](docs/job-coverage.md): which parts of an Exchange Online administrator's job each page covers, and which it does not.
- [docs/mcp.md](docs/mcp.md): the read-only MCP server, its 18 tools, what data reaches the AI client, and how to connect Claude desktop or Claude Code.
- [docs/mailflow-export.md](docs/mailflow-export.md): a read-only PowerShell 7 script that exports every setting affecting mail flow, inbound and outbound, to one JSON file. One live run so far (see Where the project stands).
- [docs/nexthop.md](docs/nexthop.md): how NextHop predicts mail flow, what it reads, and what it mocks.
- [docs/snapshots.md](docs/snapshots.md): Config snapshots, where they are stored, and how Compare matches objects.
- [docs/portal-columns.md](docs/portal-columns.md): each table's columns and the portal page they match.

## License

MIT. See [LICENSE](LICENSE).
