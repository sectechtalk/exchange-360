# Mail flow configuration export

`export/Export-MailFlowConfig.ps1` writes every Exchange Online and Purview setting that can change what happens to a message, inbound or outbound, into one JSON file. You run it yourself in PowerShell 7 and sign in with MFA. Exchange 360 and NextHop 360 both read the file.

It is read-only. Every tenant read is a `Get-` cmdlet, and the script checks its own sections before it connects: if any section would run anything other than a `Get-` cmdlet or `Where-Object`/`Select-Object`/`ForEach-Object`, it stops with "Refusing to run". It is separate from the tabled live PowerShell object (`Get-Ex360Tenant.ps1`), which is not built.

## Why it lives in ex360

Exchange 360 already reads all of these settings through `server/Invoke-Ex360Command.ps1`, its tests already run PowerShell against fake cmdlets, and its public export already scrubs tenant values. NextHop 360 reads the file only; it never needs the script. Keeping one copy here means one place to fix a cmdlet, and the file format (`sectechtalk.mailflow-config`, version 1) is the contract between the two apps.

## Run it

PowerShell 7, from the repository folder:

```powershell
cd $HOME\exchange-360
pwsh -File .\export\Export-MailFlowConfig.ps1 -UserPrincipalName admin@contoso.com
```

You get two Microsoft sign-in prompts: Exchange Online first, then Security & Compliance. The console prints one line per section (`OK`, `EMPTY`, `ERROR`, `UNAVAILABLE`, `SKIPPED`), then the file path. The default file is `$HOME\Ex360-exports\mailflow-config-<mailbox>-<yyyyMMdd-HHmm>.json`.

| Option | What it does |
| --- | --- |
| `-UserPrincipalName` | The account you sign in with. Required unless `-UseExistingConnection`. |
| `-Mailbox` | The mailbox for the forwarding, inbox rules, delegates, holds and junk sections. Defaults to the signed-in account. |
| `-OutputPath` | Where to write the file. |
| `-SkipCompliance` | Do not connect to Security & Compliance. Purview sections are recorded as `skipped` with that reason. |
| `-UseExistingConnection` | Use connections already open in this window. They are left open afterwards. |
| `-ListSections` | Print every section and its exact command. Nothing connects. |

Exit code `0` means every section ran (`ok` or `empty`). Exit code `1` means the file was written but at least one section was `error`, `unavailable` or `skipped`. Any other failure writes no file.

The first time only, if the module is missing: `Install-Module ExchangeOnlineManagement -Scope CurrentUser` (free).

## What a section looks like

```json
"journalRules": {
  "title": "Journal rules",
  "group": "routing",
  "direction": "both",
  "session": "exo",
  "command": "Get-JournalRule",
  "status": "error",
  "count": 0,
  "items": [],
  "error": { "message": "<exact PowerShell error text>", "category": "...", "errorId": "...", "exceptionType": "..." },
  "warnings": [],
  "durationMs": 412
}
```

| status | Meaning |
| --- | --- |
| `ok` | The command ran and returned one or more items. |
| `empty` | The command ran and returned nothing. Nothing is configured. This is not an error. |
| `error` | The command ran and failed. `error.message` is the exact text PowerShell gave. |
| `unavailable` | The cmdlet does not exist in the session (licence, role, or module version). `error.hint` says so. |
| `skipped` | The command did not run because its connection failed or `-SkipCompliance` was used. `error.message` says which. |

`items` hold every property the cmdlet returned, converted to plain JSON: lists stay lists, dictionaries become objects, dates are UTC ISO 8601, Exchange identity and size types become their text. Values longer than 100,000 characters or lists longer than 5,000 items are cut and their paths listed under `truncated`.

## Secrets

- Properties whose names contain password, secret, token, private key, shared key, credential, API key, connection string or SAS are replaced with `(removed: may hold a secret)` and their paths are listed under `secretsRemoved`. Booleans such as `PasswordEnabled` are kept.
- Binary values (for example the OME logo) become `(binary, N bytes; not exported)`.
- Before writing, the whole file is scanned for a JSON Web Token, a private key block or a SAS signature. If one is found, nothing is written and the script says which pattern matched.
- The sign-in token is never read or stored by the script. The ExchangeOnlineManagement module holds it.

The file still holds tenant details that are private but not secret: the tenant ID, domain names, addresses in rules, inbox rule contents and the automatic reply text. Keep it on your PC; do not commit it.

## Sections

Run `-ListSections` for the exact list. In short:

- **Routing:** organization config, transport config, accepted domains, remote domains, inbound and outbound connectors, mail flow rules (every condition, exception and action), journal rules, external sender tag, trusted ARC sealers, DKIM signing.
- **Protection:** connection filter (IP allow and block lists), anti-spam, outbound spam, anti-malware, anti-phishing, Safe Links and Safe Attachments policies and their rules, Defender global settings, Standard/Strict/Built-in preset rules, Tenant Allow/Block List (senders, URLs, files, IPs, spoof), quarantine policies, advanced delivery (SecOps mailboxes and phishing simulations).
- **Encryption:** IRM configuration, OME templates, rights protection templates.
- **Retention (Exchange):** MRM retention policies and tags.
- **The mailbox:** the mailbox object (forwarding, holds, quotas, delivery restrictions, send on behalf), the owner as a user (`mailboxUser`: department, title, office, country, manager, which mail flow rules can match and manager moderation needs), groups it is a direct member of, client access (SMTP AUTH), size, inbox rules including hidden ones, Full Access, Send As, calendar delegates, automatic replies, junk email settings.
- **Purview:** DLP policies and rules, sensitive information type names and IDs (`dlpSensitiveInformationTypes`, so a rule that names a type by GUID can be read by name), sensitivity labels and label policies, auto-labeling policies and rules, retention policies, rules and labels, eDiscovery cases, hold policies and hold rules.

## Not in the file

- DNS (MX, SPF, DKIM records, DMARC, MTA-STS). NextHop 360 uses a fake external address, so it does not need them; Exchange 360 checks DNS live.
- On-premises Exchange and hybrid servers.
- The definitions (patterns) of sensitive information types and keyword dictionaries. `dlpSensitiveInformationTypes` holds only their names and IDs.
- Nested group membership. `mailboxMemberOf` lists direct memberships only.
- Message trace and quarantined messages. Those are activity, not configuration.

## Changing the format

Add optional fields only. A rename or a removal bumps `version` and the schema file name (`docs/contracts/mailflow-config.v1.schema.json`). Tests: `tests/mailflow-export.test.mjs`, which runs the script end to end against `tests/fixtures/mailflow-stubs.ps1` when `pwsh` is installed.
