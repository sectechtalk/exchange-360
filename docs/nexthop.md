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
| `tests/nexthop.test.mjs` | Engine, sample, examples, report and page checks. |
