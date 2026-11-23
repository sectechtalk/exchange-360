# How Ex360 signs in

Ex360 is a **public client**. The app registration has no client secret. The local Node server uses the authorization-code flow with PKCE, which is the flow a public client is allowed to use.

Microsoft Authentication Library for Node does not host this redirect for a public client (its public-client helpers are device code and interactive desktop). Ex360 therefore performs the same protocol those libraries use:

1. The browser opens `https://login.microsoftonline.com/<tenant>/oauth2/v2.0/authorize` with `code_challenge` (S256), `response_type=code`, and the Graph scopes.
2. Entra redirects to `http://localhost:8360/auth/callback` with a code.
3. The server posts the code and the `code_verifier` to the token endpoint. The body has a client id, the code, and the PKCE verifier. It does not send `client_secret` or `client_assertion`.
4. The access token and refresh token stay in the server process memory, keyed by an HttpOnly cookie. They are not written to disk.

## Token renewal

Access tokens last about an hour. Before every `/api/` call the server renews any token (Graph, Exchange, compliance) that expires within five minutes, using its refresh token. Before this was added, every page said **Not authorized** an hour after sign-in even though nothing about permissions had changed. If renewal fails, the header shows **Sign-in needs attention** and Setup steps shows the Entra error.

When there is no usable Exchange token (most often because admin consent for `Exchange.Manage` was granted after you signed in), the server asks Entra again from the Graph refresh token, at most every 30 seconds. Granting consent and then clicking **Run every check** on Setup steps is enough; a new sign-in is not needed.

A Graph `401` with `InvalidAuthenticationToken` or an expired token is shown as **Sign in again**, not as a missing permission. `403` stays **Not authorized**.

Sessions are kept in memory only. Restarting the container signs everyone out. The header then shows **Ex360 restarted. Sign in again** instead of quietly switching to demo data without saying so.

## One sign-in for all four

The **Sign in** button at the bottom of the left pane starts the Graph sign-in. That is the only interactive prompt (account picker, password, MFA). When the code comes back, the server redeems the Graph refresh token, without any prompt, for each of the other three connections at the same time:

| Connection | Scope requested with the refresh token |
| --- | --- |
| Exchange | `offline_access https://outlook.office365.com/.default` |
| Purview Graph | the Graph scopes plus the six Purview scopes in the table below |
| Compliance PowerShell | `offline_access https://ps.compliance.protection.outlook.com/.default` |

This works because a refresh token issued to a public client is a multi-resource refresh token: Entra lets it be redeemed for any resource the app already has consent for, and the MFA from the first sign-in carries over. Nothing new is requested from the tenant. These are the same permissions the four separate buttons already asked for.

If one of them still fails (for example Conditional Access asks for fresh MFA for that resource, or consent is missing), the callback puts it at the front of the `next` chain and the browser goes straight on to that hop with `login_hint` and no forced `prompt`. Entra's own sign-in cookie normally completes those hops without showing anything; if Entra needs input, it shows it once and returns. The server logs `auth.silent` with what connected, what is missing, and the AADSTS code of each failure, never a token.

A Purview token only replaces the Graph token when it really contains all six Purview scopes, so a half-consented tenant keeps its working Graph sign-in.

## Two tokens

Graph and Exchange Online are different resource audiences. One token cannot carry both.

- The first hop asks for the Graph scopes in `.env` (`User.Read`, `Directory.Read.All`, `Mail.Read`, and the rest).
- The server then redeems the refresh token for `https://outlook.office365.com/.default`. That is the scope Exchange Online PowerShell requests. `Exchange.Manage` stays a delegated permission on the app registration. Sending the bare name `Exchange.Manage` makes Entra look for it on Microsoft Graph (`00000003-0000-0000-c000-000000000000`) and the hop fails with **AADSTS650053**.
- If that consent has never been granted, the Exchange pages say **Not authorized** and point to Setup steps, which links to **Grant admin consent** on the app's API permissions page. **Sign in for Exchange Online** opens `/auth/login?resource=exchange&return=<page>`. It does not force `prompt=consent`: Entra shows the consent screen by itself when consent is missing, and forcing it on every sign-in blocks non-admins in tenants where user consent is off. `consent=1` still forces it when you want the screen. The page id is stored with the sign-in state and the callback redirects to `/#<page>`.
- The header lists Graph, Exchange, Purview Graph, and Compliance PowerShell. Each one that is not connected has its own sign-in button, kept as a fallback. **Connect everything** opens `/auth/connect-all`, which first tries every missing connection silently (see **One sign-in for all four** below) and only then hops to Entra for what is still missing (`next=purview,compliance` when Exchange is the one that is missing).
- The server logs each hop start, the callback result, token-endpoint failures (`AADSTS` code and the first 300 characters of `error_description`), and Exchange or compliance PowerShell failures. The log line does not include tokens, authorization codes, or PKCE verifiers.

`Connect-ExchangeOnline -AccessToken` uses the Exchange token. The container's `server/Invoke-Ex360Command.ps1` reads the token from a short-lived file (mode 600), never from the process command line, and only runs `Get-` cmdlets.

Before that call, Ex360 decodes the token payload (no signature check, and the token is not logged). If `scp` does not include `Exchange.Manage`, the page says consent is missing and links to the app's API permissions blade, where **Grant admin consent** is. It does not start PowerShell. The compliance token is checked the same way: an empty `scp` skips `Connect-IPPSSession`.

Microsoft Learn for the current ExchangeOnlineManagement module (`view=exchange-ps`, which covers 3.11) says `-AccessToken` is used with `-Organization`, `-DelegatedOrganization`, or `-UserPrincipalName` depending on the token. `-Organization` is the certificate-based and managed-identity path. A delegated token uses `-UserPrincipalName` of the signed-in account (the id token `preferred_username`, or Graph `/me` when that is missing). `-Organization` remains only when the UPN is unknown. `Connect-IPPSSession` is documented the same way.

## Admin consent

State on 2026-11-17: admin consent was first missing for `Exchange.Manage` and the six Purview Graph permissions below, then granted the same morning. After that every Setup steps check passed, including a live `Connect-ExchangeOnline`, and the Exchange, Purview Graph and Compliance PowerShell sign-ins all connected. **Setup steps** (`http://localhost:8360/#setup`) reads the real grants (`GET /oauth2PermissionGrants`, Directory.Read.All) and shows what is and is not consented today, so this paragraph is history, not the source of truth.

**Everything for one recipient** (`#mb-report`) needs no new permission and no tenant change. It reuses the Graph sign-in (User.Read.All, Directory.Read.All, AuditLog.Read.All, Policy.Read.All, and SecurityAlert.Read.All from the Purview sign-in), the `Exchange.Manage` token for one Exchange Online PowerShell session of `Get-` commands, and the compliance token for one Security & Compliance session of `Get-` commands. A part your role cannot read shows **Not authorized** in the page and in the PDF.

A Global Administrator or Privileged Role Administrator grants it once: Entra, the app, **API permissions**, **Grant admin consent for <tenant>**, **Yes**. After that, other users sign in as themselves and see only what their own roles allow.

## Roles the signed-in person needs

No new or custom role is needed. Ex360 v1 only reads, so the least-privileged built-in Entra role that covers the Exchange pages is **Global Reader** (it includes Exchange's View-Only Organization Management). Exchange Administrator and Global Administrator also work. Setup steps checks your active roles (`/me/transitiveMemberOf`, falling back to the token's `wids` claim). Roles that are only *eligible* in Privileged Identity Management do not count until you activate them. Message trace, Purview and compliance pages have their own role notes on each page.

Redirect URIs on the registration. Both are **Mobile and desktop applications** (public client). Neither is a Web redirect. Fallback public client is enabled.

- `http://localhost:8360/auth/callback`
- `http://localhost`

If the callback is left on the Web platform, Entra treats the app as a confidential client and the token request fails with **AADSTS7000218** (`client_assertion` or `client_secret` required). Move the URI to Mobile and desktop. Do not add a client secret. The same note is on Playbooks under Sign-in errors.

**AADSTS650053** on the Exchange hop means the token request asked for `Exchange.Manage` and Entra evaluated that name on Microsoft Graph. Set `EXO_SCOPE` to `https://outlook.office365.com/.default`. If `.env` already exists, change it there. The environment value overrides the built-in default. Do not add a new app permission for this. `Exchange.Manage` is already on the registration.

## Compliance tokens

Do not add the permissions below to the first Graph sign-in until they are on the app registration. Entra rejects the whole authorize request if a scope is not on the app, and the sign-in that works today would stop.

- `GET /auth/login?resource=purview` asks for the current Graph scopes plus the six new ones in the table. The resulting token replaces the Graph token for that session.
- `GET /auth/login?resource=compliance` asks for `https://ps.compliance.protection.outlook.com/.default`. That token is stored separately and is passed to `Connect-IPPSSession -AccessToken -UserPrincipalName` for the signed-in account.

`Connect-IPPSSession -AccessToken` is a real parameter (ExchangeOnlineManagement 3.8.0-Preview1 and later; the image has 3.11.1). Microsoft Learn says the parameter is used with Organization, DelegatedOrganization, or UserPrincipalName depending on the token, and the default connection URI is `https://ps.compliance.protection.outlook.com/powershell-liveid/`. Learn does **not** publish a delegated permission GUID for a customer public client. There is nothing to paste into the app registration for that resource beyond requesting the scope above. The signed-in person still needs a Purview role that can run the read cmdlets. Ex360 does not use certificate app-only authentication.

Graph is used wherever a delegated read exists: sensitivity labels, retention labels, eDiscovery cases, Conditional Access (`Policy.Read.All`, already granted), directory roles (`RoleManagement.Read.Directory`, already granted), incidents, alerts, and directory audit. DLP policy objects, retention compliance policies, unified audit search and Purview role groups are read with Security & Compliance PowerShell. Creating a Graph audit-log query is a POST, so Ex360 does not do it.

### New delegated permissions

Add these on application `your-client-id`. Identifiers are the delegated permission ids from the Microsoft Graph permissions reference, checked 2026-11-17. Do not request the application-only twins.

| Resource | Permission | Delegated id | Why |
| --- | --- | --- | --- |
| Microsoft Graph | InformationProtectionPolicy.Read | `4ad84827-5578-4e18-ad7a-86530b12f884` | Read published sensitivity labels and label policy settings. `InformationProtectionPolicy.Read.All` (`19da66cb-0fb0-4390-b071-ebc76a349482`) is application-only. |
| Microsoft Graph | RecordsManagement.Read.All | `07f995eb-fc67-4522-ad66-2b8ca8ea3efd` | Read retention labels and records-management configuration. |
| Microsoft Graph | eDiscovery.Read.All | `99201db3-7652-4d5a-809a-bdb94f85fe3c` | Read eDiscovery cases and holds. |
| Microsoft Graph | AuditLogsQuery.Read.All | `1d9e7ac3-0eca-442c-82f9-e92625af6e6d` | Read unified audit query results. Ex360 does not create queries. |
| Microsoft Graph | SecurityAlert.Read.All | `bc257fb8-46b4-4b15-8713-01e91bfbe4ea` | Read Defender XDR alerts. `SecurityEvents.Read.All` stays for the older alerts API. |
| Microsoft Graph | SecurityIncident.Read.All | `b9abcc4f-94fc-4457-9141-d20ce80ec952` | Read Defender XDR incidents. |
| Office 365 Exchange Online | Exchange.Manage, requested as `https://outlook.office365.com/.default` | already on the app; the delegated permission GUID is not published on the Graph permissions page. This is not a new permission. | Migrations, Exchange role groups, management role assignments, `Search-AdminAuditLog`, `Get-AdminAuditLogConfig`, and (from 19 November 2026) the organization settings behind Config review, `Get-Mailbox`, `Get-CalendarProcessing`, `Get-DistributionGroup`, `Get-DistributionGroupMember`, `Get-DynamicDistributionGroup`, `Get-UnifiedGroup`, `Get-QuarantineMessage`, `Get-MessageTraceV2` and `Get-MessageTraceDetailV2`. |
| Security & Compliance PowerShell | `https://ps.compliance.protection.outlook.com/.default` | no delegated GUID is published | `Get-DlpCompliancePolicy`, `Get-DlpComplianceRule`, `Get-RetentionCompliancePolicy`, `Get-Label`, `Get-LabelPolicy`, `Get-ComplianceCase`, `Get-CaseHoldPolicy`, `Get-RoleGroup`, `Search-UnifiedAuditLog`. |

`Policy.Read.All` (`572fea84-0151-49b2-9301-11cb16974376`) and `RoleManagement.Read.Directory` (`741c54c3-0c1e-44a1-818b-3f97ab4e8c83`) are already on the first sign-in. Conditional Access and Entra directory roles use those. They are not new.

## What Ex360 will not do

There is no app-only identity, no client secret, and no certificate. v1 does not write to the tenant. Pages use GET. The only POST is the local Outlook collector, and it posts to the container, not to Microsoft.

## Config review, Recipients, Trace a message and Quarantine

These four pages, added on 19 November 2026, need no new permission and no tenant change. They reuse the same `Exchange.Manage` token and the same read-only PowerShell script, which only runs `Get-` and `Search-` cmdlets (a test fails the build otherwise). What the signed-in person can see still depends on their Exchange role:

- Organization settings, recipients and message trace: Global Reader or View-Only Organization Management is enough.
- Quarantine: `Get-QuarantineMessage` needs Security Reader, Quarantine Administrator, Security Administrator or Global Administrator. Without one, the page says **Not authorized**.
- Safe Links, Safe Attachments and preset Defender policies need Microsoft Defender for Office 365 in the tenant. Without it those reads say **License required**.

Recipients also reads `accountEnabled` for up to 50 shared mailboxes from Microsoft Graph with the existing User.Read.All permission, to say whether direct sign-in is blocked.
