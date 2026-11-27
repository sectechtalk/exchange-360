# Config snapshots

**Organization > Auditing/Logging > Config snapshots** (`http://localhost:8360/#snapshots`).

## Where snapshots are stored

- **A snapshot store you run** (optional), when `.env` has `SNAPSHOT_STORE_URL` and `SNAPSHOT_STORE_API_SCOPE` (`api://<store API app id>/Snapshots.ReadWrite`). Exchange 360 redeems your Graph sign-in for a token for that API without a prompt and sends each snapshot to `POST {SNAPSHOT_STORE_URL}/api/ex360/snapshots` (`GET` the same path to list, `GET .../<name>` to read one). The store checks the token and your role, then keeps the snapshot. Nothing is kept on the PC; the list and Compare read the snapshots back from the store. The store is not part of this repository.
- **This PC**, until those two values are set: the folder below.

## Take a snapshot

**Take snapshot** runs the same read-only `Get-` reads as `export/Export-MailFlowConfig.ps1` (and the NextHop live read) with your own sign-in, then saves one JSON file:

- In Docker: `%USERPROFILE%\Ex360-snapshots` on the PC, mounted at `/snapshots` (`docker-compose.yml`; set `EX360_SNAPSHOTS_HOST` for another folder).
- Outside Docker: `EX360_SNAPSHOTS_DIR`, or `~/Ex360-snapshots`.

The file is the export (format `sectechtalk.mailflow-config`, version 1, see [mailflow-export.md](mailflow-export.md)) plus a `snapshot` header: `takenAt`, `takenBy`, optional `label`, `app`, `readOnly: true`. Name: `ex360-snapshot-<organization>-<yyyyMMdd-HHmmss>.json`.

Nothing in the tenant changes. Secret-named properties are removed by the export; before writing, the server scans the whole file again for a JSON Web Token, a private key block or a SAS signature and refuses to write it if one is found. Compliance PowerShell not connected means the Purview sections are recorded as Skipped.

Starting a snapshot is the only page POST besides the Outlook collector (`POST /api/snapshots/start`, JSON body). The session cookie is `SameSite=Lax`, so another site cannot start one.

## List and compare

The list shows every snapshot and every export file in `%USERPROFILE%\Ex360-exports` (read-only). Select a row for its details, **Download (.json)** and **Compare: use as Before / After**.

**Compare** (`lib/snapshot-diff.js`):

- Objects are matched by the first key every item in both lists has, unique: `Guid`, `ExchangeObjectId`, `ImmutableId`, `Id`, `Identity`, `DistinguishedName`, `Name`, `DomainName`, `Value`, `User`; otherwise by position, and the flyout says so.
- Nested values compare property by property (`a.b[0].c`). The order of plain lists (IP ranges, domains) is ignored.
- Values that change on their own are not compared (`WhenChanged`, counters, sizes, last logon times, PowerShell plumbing). The page lists them.
- A section that was not read (`error`, `unavailable`, `skipped`) on either side is reported as not comparable. Not read is not the same as nothing configured.
- Different tenant IDs show a warning.

## Not built yet

- Deleting snapshots from the page: delete the file in the folder.
- Scheduled snapshots.
