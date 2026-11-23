# Setup steps

Every one-off setting Ex360 needs, in the order to do them. The **Setup steps** page in the app (`http://localhost:8360/#setup`) checks each one live with your own sign-in and shows the fix for anything that fails. This file is the written copy, so nothing lives only in someone's memory. If you change a setting, change it here and in `lib/setup.js` too.

Ex360 never makes these changes itself. Each one is a step a person takes in Entra or on the PC.

## 1. On the PC

| Setting | Value | Checked by |
| --- | --- | --- |
| Docker Desktop | Installed and running. | Start-Ex360.ps1 stops if `docker` is missing. |
| `.env` | Created once from `.env.example` by `Start-Ex360.ps1`. Holds `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_ORGANIZATION`, `ENTRA_REDIRECT_URI`. No secrets. | Setup steps: **Tenant and app ids are in .env** |
| `EXO_SCOPE` | `https://outlook.office365.com/.default`. An older `.env` may still say `Exchange.Manage`, which fails with AADSTS650053. | Setup steps: **Exchange scope in .env is the .default scope** |
| Container | `docker compose up --build -d`. Listens on `127.0.0.1:8360` only. The image has PowerShell 7 and ExchangeOnlineManagement 3.7.2 or later. | Setup steps: **PowerShell 7 and ExchangeOnlineManagement are in the container** |
| Browser address | Always `http://localhost:8360`. `127.0.0.1` keeps a separate cookie, so you look signed out after every sign-in. | Setup steps: **Redirect URI matches this address** |

After any change to `.env`, rebuild and restart in PowerShell 7:

```powershell
cd $HOME\exchange-360; docker compose up --build -d
```

## 2. App registration in Entra (one time, by an admin)

Open the app in the [Entra admin center](https://entra.microsoft.com), under **Identity**, **Applications**, **App registrations**, **All applications**, then **Ex360**.

| Setting | Value | Checked by |
| --- | --- | --- |
| Supported account types | Accounts in this organizational directory only. | Shown in the written record on Setup steps. |
| Authentication, platform | **Mobile and desktop applications** with `http://localhost:8360/auth/callback` and `http://localhost`. No Web or Single-page application redirect URIs. A Web copy of the callback fails sign-in with AADSTS7000218. | Setup steps: **Redirect URIs are on Mobile and desktop applications** |
| Authentication, Advanced settings | **Allow public client flows**: Yes. No client secret, no certificate. | Same row. |
| API permissions, Microsoft Graph (delegated) | `User.Read`, `User.Read.All`, `Directory.Read.All`, `Organization.Read.All`, `Domain.Read.All`, `Policy.Read.All`, `AuditLog.Read.All`, `Reports.Read.All`, `ServiceHealth.Read.All`, `ServiceMessage.Read.All`, `SecurityEvents.Read.All`, `Mail.Read`, `Mail.Read.Shared`, `MailboxSettings.Read`, `RoleManagement.Read.Directory`. | Setup steps: **Microsoft Graph permissions are on the app** |
| API permissions, Office 365 Exchange Online (delegated) | `Exchange.Manage`. Add it from **Add a permission**, **APIs my organization uses**, **Office 365 Exchange Online**, **Delegated permissions**. | Setup steps: **Office 365 Exchange Online permissions are on the app** |
| Admin consent | On **API permissions**, click **Grant admin consent for <your tenant>**, then **Yes**. Needs a Global Administrator or Privileged Role Administrator. Success: every row's Status column shows a green tick and **Granted for <your tenant>**. | Setup steps: **Admin consent covers Microsoft Graph** and **Admin consent covers Office 365 Exchange Online** |

After consent, go back to Setup steps and click **Run every check**. Ex360 gets the Exchange token again from your existing sign-in, so you don't need to sign in again. If the token rows still fail, click **Sign out**, then **Sign in**.

## 3. The person signing in

| Setting | Value | Checked by |
| --- | --- | --- |
| Account | Your own work account, with MFA. Ex360 only ever acts as you. | Setup steps: **You are signed in** |
| Entra role | **Global Reader** is the least-privileged role that covers the Exchange pages (it includes View-Only Organization Management). Exchange Administrator and Global Administrator also work. No new or custom role is needed. If you use Privileged Identity Management, activate the role before signing in. | Setup steps: **You hold an Entra role that can read Exchange** |
| Tokens | Your Graph token must carry the Graph permissions, and your Exchange token must carry `Exchange.Manage`. Ex360 renews both before they expire. | Setup steps: **Your Graph token has the permissions** and **Your Exchange token has Exchange.Manage** |
| Exchange Online PowerShell | `Connect-ExchangeOnline -AccessToken <your token> -UserPrincipalName <you>` followed by `Get-OrganizationConfig`. | Setup steps: **Exchange Online PowerShell connects as you** (runs when you click **Run every check**) |

## 4. Optional

| Piece | Needed only for | How |
| --- | --- | --- |
| Purview Graph permissions | Sensitivity labels, Retention labels, eDiscovery, Defender XDR | Add the six delegated Graph permissions listed in [auth.md](auth.md#new-delegated-permissions), grant admin consent, then **Sign in for Purview reads**. |
| Security & Compliance PowerShell | DLP, Retention, Audit search, Compliance admin | **Sign in for compliance PowerShell**, plus a Purview role that can run the read cmdlets. |
| Outlook collector | Outlook on this PC | Run `Collect-Ex360Outlook.ps1` from that page in Windows PowerShell on the PC. |

## What success looks like

The top of Setup steps says **Everything Ex360 needs is in place.** and the header shows **LIVE**. Optional rows don't count toward that.
