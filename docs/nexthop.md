# NextHop (Troubleshoot > NextHop)

NextHop answers "what would Exchange Online do with this message?" before anyone sends it. It reads a mail flow configuration, takes one test message between the configuration's mailbox and a made-up outside address, and lists every step in the order Exchange Online applies it: what happens, why, which component did it, and the exact setting behind it. It is read-only and free. Nothing is sent, nothing is looked up, and no tenant is touched.

NextHop is a page in Exchange 360 rather than a separate app, because Exchange 360 already has the sign-in, the config export, the rule and connector pages and the step-by-step trace format.

## The two inputs

| Input | What it is |
| --- | --- |
| **Contoso sample topology** | `lib/nexthop-sample.js`. A fictional organization written in exactly the shape `Export-MailFlowConfig.ps1` produces, so NextHop reads it like a real export. It opens only when you choose **Open the Contoso sample topology**; it is never shown because you are signed out. Every page that shows it says "Sample topology: fictional Contoso, not your tenant". **Download the sample as an export file (.json)** saves it. |
| **An export of your tenant** | Run `export/Export-MailFlowConfig.ps1` (read-only, `Get-` cmdlets only, MFA sign-in), then choose **Open an export file (.json)**. The file is read in the browser and never uploaded. Sections the export could not read are listed, and every prediction says which of them it had to treat as "not configured". |

The sample was not deployed and exported: no lab tenant change is needed. It is built from the export contract (`docs/contracts/mailflow-config.v1.schema.json`) and the property names the real cmdlets return. `tests/nexthop.test.mjs` checks that it has every section the script writes, with the same command, group, direction and session, and that it passes the contract.

### Added to the export for NextHop

Two sections, both `Get-` reads (generator version 1.1.0; the format stays version 1 because only optional sections were added):

- `mailboxUser` (`Get-User -Identity <mailbox>`): department, title, office, country and manager. Mail flow rules can match these (`SenderADAttributeContainsWords`), and "moderate by the sender's manager" needs the manager.
- `dlpSensitiveInformationTypes` (`Get-DlpSensitiveInformationType | Select-Object Name, Id, Publisher, Type`): so a DLP or auto-labeling rule that names a type by GUID can be read by name.

### Reading the live tenant (no export file)

Signed in, NextHop's Configuration panel has **Read my live tenant (no export file)**. Exchange 360 runs the same read-only export (`export/Export-MailFlowConfig.ps1`) inside the container through `server/Invoke-Ex360NextHop.ps1`, with your own delegated Exchange and Security & Compliance tokens (written to mode-600 files and deleted afterwards, never on a command line). It connects to Exchange Online, reads the Exchange sections, then connects to Security & Compliance (`-ConnectCompliance`) and reads the Purview sections, so cmdlet names that exist in both sessions read from the right one. The result is kept in the server's memory for your session only (`server/nexthop-live.mjs`, `GET /api/nexthop/live`).

A read takes a minute or two. The page shows a progress bar by section. You can leave NextHop: when the read finishes, any Exchange 360 page shows a bubble with **Open NextHop**, and Windows shows a notification if the tab is in the background and you allowed notifications. A read that finishes in under 10 seconds gets no bubble.

### After a refresh

The open configuration, the test message and the live read's finish time are saved in this browser (IndexedDB, on your PC only), so a refresh comes back to the same configuration and form. **Close** removes them. After a prediction, **Change this check** goes back to the form with the same values and **New check** starts from a blank message.

## The test message

Direction (inbound or outbound), the outside address, the subject, body and attachments (name and size), and the message type (normal, automatic forward, automatic reply). Inbound adds the From display name and three **mocked** values, because the outside side is fake and NextHop does no DNS: the sending IP (trips connection filter, inbound connector IP scoping, advanced delivery and IP conditions), the sender's authentication result (pass, DMARC fail with p=reject/quarantine/none, or composite fail), the spam filter's verdict and bulk complaint level, and whether an attachment is malware. Outbound adds the sensitivity label the sender applies.

## Fill it from a real message

Under **Test message**, open **Fill it from a real message**. Paste the message's header block (Outlook: File > Properties > Internet headers, or Message trace), paste a whole message, or choose a .eml or .msg file. **Fill the form and predict** reads what NextHop needs, fills the form and runs the prediction. A table shows each value and the header it came from:

| Field | Read from |
| --- | --- |
| Direction | `X-Forefront-Antispam-Report` DIR, then `X-MS-Exchange-Organization-MessageDirectionality`, then whether From is an accepted domain |
| Outside address, From display name | From (inbound); the first outside To or Cc (outbound) |
| Sending IP | `X-Forefront-Antispam-Report` CIP, else the oldest outside Received hop |
| Sender authentication | `Authentication-Results`: dmarc=fail with its action (reject, quarantine, none), else compauth=fail or CAT:SPOOF |
| Spam verdict, bulk level, malware | `X-Forefront-Antispam-Report` CAT and SFV, `X-Microsoft-Antispam` BCL, CAT:MALW |
| Message type | `Auto-Submitted`, Exchange inbox rule headers |
| Subject, body, attachments | Subject (encoded words decoded); a whole .eml also gives the text body and each attachment's name and size |

It says what it could not use: a header block has no body; spam filtering skipped on arrival (SFV:SKN and similar) hides the real verdict; IPv6 is not matched against IPv4 ranges; a message to or from a different mailbox than the one in the configuration uses that configuration's mailbox for mailbox-level settings. The mail flow rules the headers say ran (`X-MS-Exchange-Organization-Rules-Execution-History`) are listed so they can be compared with the prediction, which always uses today's configuration.

## Message path (hidden for now)

Mail flow lanes replaced it on the page; the code stays (`SHOW_MESSAGE_PATH` in public/message-path-view.js). The **Message path** pane draws the configuration as the steps Exchange Online applies, in the order NextHop checks them, with every object under its step: accepted domains, inbound connectors and the connection filter, anti-malware, mail flow rules (by priority) and DLP, anti-phishing and anti-spam, Safe Attachments, Safe Links and journaling, then the mailbox, its inbox rules and holds (inbound); the mailbox and its groups, anti-malware and outbound spam, rules, DLP, journaling and auto-labeling, remote domains, outbound connectors and DKIM (outbound). A mail flow rule sits on the inbound or outbound path from its sender and recipient scope; a rule with no scope sits on both. Disabled objects show **Off** and test-mode ones **Test**.

After a prediction the path lights up: each step says **Passed**, **Stopped here**, **Delivered** or **Not reached**, and every object that acted on the message is coloured by what it did, with its line number in "What happens, step by step". Selecting any object opens its settings, what it did to this message, and the portals where it is changed. **Copy path as text** copies one line per step.

## Mail flow lanes

**Mail flow lanes** (opens first, after a prediction) shows one numbered column for each place a configuration object acts, left to right in the order Exchange Online applies them, for **Inbound** or **Outbound**.

- Inbound: outside sender; accepted domains; connectors, connection filter and advanced delivery; anti-malware; mail flow rules (priority order); data loss prevention; anti-phishing, anti-spam and quarantine policies; Safe Attachments and Safe Links; journaling; recipient mailbox, inbox rules and retention. Threat policies act twice: malware before the rules, phishing and spam after them.
- Outbound: sender mailbox and groups; outbound spam; anti-malware; mail flow rules; DLP and auto-labeling; journaling; remote domains; DKIM signing; outbound connectors; outside recipient.

A message is tracked exactly as on the Message path (the same objects lit in the same tones with the same step numbers, the same flyout), and a line joins the objects that acted in step order. The columns follow the engine's order, so the line only moves right; the recipient mailbox is also looked up at the front door, and the line meets it where the message is delivered. **Copy route as text** copies one line per object.

## Page layout

Every pane folds under its heading with **Collapse** / **Expand** and starts collapsed on each visit. Portal buttons put the home portal first, filled solid and labelled "Home:": the portal of the service that stores the object (`HOME_PORTAL` in lib/object-links.js). The other portals show some of its settings. Right under the buttons is the PowerShell that returns every setting (`getCommand()`), in object flyouts, under each prediction step and in Topology at a glance; table cells across Exchange 360 get the same home-first order. In the prediction, each step of "What happens, step by step" has its own **Settings that caused it** under it (the step that stopped or changed the message opens by itself). **Topology at a glance** is drawn like the Message path: every row of the table is a box (select it for its names, portals and the export's PowerShell read), under ten numbered stops for the stages a message travels through (arrives, connection, anti-malware, mail flow rules and DLP, anti-phishing and anti-spam, Safe Attachments and Safe Links, journaling and labels, the mailbox, leaving the organization, organization-wide). Each box says how many items it holds and whether the prediction uses it yet ("Not predicted yet"); the same areas are also available as a table. It also and lists what is not in the export at all (DNS, other recipients, groups as recipients, hybrid, Microsoft's own service).

## What it checks, in order

**Inbound:** accepted domain; inbound connectors (sender domains, sender IPs, "only accept from these IPs"); mailbox delivery restrictions and size limits; mailbox quota; advanced delivery (phishing simulation, SecOps mailbox); connection filter IP Allow and Block Lists; Tenant Allow/Block List for IPs and senders; anti-malware (common attachments filter, quarantine policy); mail flow rules in priority order (conditions, exceptions, test mode, stop processing, activation and expiry dates, and actions including reject, delete, quarantine, moderation, redirect, SCL, subject, disclaimer, headers, encryption, Bcc and incident reports); DLP (Exchange location, test mode, sensitive information types, override); content filtering in Microsoft's precedence (phishing and high confidence spam, then spoof/DMARC and user/domain impersonation, then spam and bulk) with the policy that wins for the mailbox (Strict preset, Standard preset, custom rules by priority, default) and its quarantine policy; Safe Attachments; Safe Links and blocked URLs; journal rules; the Outlook external tag; retention and holds; the mailbox's own Safe and Blocked Senders, inbox rules and forwarding, where every forward to outside is checked against the outbound spam policy and the remote domain; automatic replies.

**Outbound:** size limits; the sender's sensitivity label; the outbound spam policy (automatic forwarding, sending limits); anti-malware; mail flow rules; DLP; auto-labeling; journal rules; the remote domain (automatic forwards and replies, TNEF, format); DKIM signing; the outbound connector (rule-scoped or by recipient domain, smart host or MX, TLS) or MX delivery.

## What it says it cannot do

NextHop never guesses. A mail flow rule condition it cannot judge from configuration (for example "attachment is password protected"), a sensitive information type it has no pattern for, and an export section that was not read are each listed under **What NextHop could not predict**. It recognises these sensitive information types by pattern and checksum (not by Microsoft's full confidence model): Credit Card Number, U.S. Social Security Number (SSN), IBAN, ABA Routing Number, U.S. ITIN and U.K. National Insurance Number. It does not know Microsoft's own content scoring or IP reputation, so the spam verdict is the value you choose. Exchange Online only; on-premises servers are out of scope.

## Where each step is configured

Under every step, **Configured in** links to each admin portal page that changes that step's setting (for example Data loss prevention > Policies in Purview for the DLP step), straight to the object where the portal can open it. Settings no portal shows name their PowerShell cmdlet instead. The step-by-step list and every table use alternating row shades.

## The report

**Download report (.mhtml)** builds one self-contained web archive in the browser (`lib/nexthop-report.js`): the outcome, the test message, every step, copies and reports (journaling, incident reports, Bcc), the settings that caused each step with links to each portal that changes them, and what NextHop could not predict. It opens in Edge. **Copy as text** gives the same steps, one per line, for a ticket.

## Code

| File | What |
| --- | --- |
| `lib/nexthop.js` | The engine. Pure: no DOM, network or Node APIs. |
| `lib/nexthop-sample.js` | The Contoso sample topology. |
| `lib/nexthop-scenarios.js` | The 14 examples on the page. |
| `lib/nexthop-report.js` | The .mhtml report. |
| `public/nexthop-page.js` | The page. Every button shows busy feedback or flashes what it did. |
| `lib/message-path.js` | The Message path model and the overlay of one prediction. Pure. |
| `public/message-path-view.js` | The Message path pane and its object flyout. |
| `lib/message-input.js` | Reads a header block or .eml into a test message, with the source of every value. Pure. |
| `tests/message-path.test.mjs` | Message path and fill-from-message checks. |
| `tests/nexthop.test.mjs` | Engine, sample, examples, report and page checks. |
