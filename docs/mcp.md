# Exchange 360 MCP server

Exchange 360 includes a [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server, so an AI client such as Claude desktop or Claude Code can call what Exchange 360 already reads, as tools. Ask the AI things like "trace the mail from billing@fabrikam.com yesterday and tell me why it was quarantined" or "what would happen to an inbound .exe from 198.51.100.9 according to my latest export".

## What it can and cannot do

- **Read-only.** Every tool is a read. There is no tool that changes the tenant, releases quarantine, or sends mail, and each tool is marked `readOnlyHint` so the client knows. The tools call the same `/api/` routes the pages use, which only accept GET, and the same `Get-`-only PowerShell script.
- **Your sign-in, your permissions.** The tools use the browser sign-in you made at `http://localhost:8360` (the most recently used one). There is no second sign-in, key or app registration. Anything your role cannot read comes back **Not authorized**, exactly as on the page. If nobody is signed in, every tenant tool says **Not signed in** and never answers from sample data.
- **Local only.** The server runs inside the Exchange 360 container. The AI client reaches it with `docker exec`, so only someone who can already run Docker commands on the PC can use it. The HTTP endpoint `/mcp` refuses any call without the random key the server writes inside the container at start (`/tmp/ex360-mcp.token`, readable only by the container user), and refuses calls from a web page on another site.
- **Free.** No new Azure resource, licence or service.

**What leaves your PC:** whatever a tool returns is sent to the AI client, and from there to that client's language model (for Claude desktop and Claude Code, Anthropic's API). That can include tenant configuration, recipient details, sign-in logs, message trace rows, quarantine rows, and message headers read from a mailbox. Only connect a client you are allowed to send that data to, and ask it only what you need.

## Tools

| Tool | What it returns | Needs sign-in |
| --- | --- | --- |
| `ex360_status` | Who is signed in and which connections are ready | No |
| `ex360_setup_check` | The Setup steps checks, with a live Exchange Online connection test | No (more with it) |
| `ex360_org` | One part of the organization configuration: `settings`, `domains`, `licenses`, `remoteDomains`, `connectors`, `transportRules`, `antiSpam`, `antiPhish`, `safeLinks`, `safeAttachments`, `quarantine`, `config`, `health`, or `all` | Yes |
| `ex360_search_recipients` | Recipients that match a name or address | Yes |
| `ex360_recipient` | Everything on the Single recipient page for one recipient | Yes |
| `ex360_recipient_report` | The "Everything for one recipient" report content | Yes |
| `ex360_signins` | The last sign-ins for one user | Yes |
| `ex360_recipients` | Shared and resource mailboxes, groups, contacts and mail users | Yes |
| `ex360_message_trace` | Message trace (`Get-MessageTraceV2`), up to 10 days, with the exact command run | Yes |
| `ex360_quarantine` | Quarantined messages, up to 30 days | Yes |
| `ex360_compliance` | DLP, retention, labels, eDiscovery, Conditional Access, roles, audit | Yes |
| `ex360_message_headers` | One message's headers read from a mailbox (Graph `Mail.Read`), analyzed | Yes |
| `ex360_analyze_headers` | Pasted headers explained: hops, SPF, DKIM, DMARC, ARC, verdicts | No |
| `ex360_dns_check` | Public DNS mail records for a domain | No |
| `ex360_nexthop_list_exports` | The mail flow export files it can read, plus `sample` | No |
| `ex360_nexthop_scenarios` | The 14 ready-made NextHop test messages | No |
| `ex360_nexthop_topology` | What an export (or the sample) holds, area by area | No |
| `ex360_nexthop_predict` | Every step Exchange Online would apply to one test message, from configuration only | No |

Answers longer than 150,000 characters are cut and say so.

### NextHop and export files

`docker-compose.yml` mounts `%USERPROFILE%\Ex360-exports` (where `export/Export-MailFlowConfig.ps1` saves) into the container at `/exports`, **read-only**. The NextHop tools read files there by name only; a path is refused. To use another folder, set `EX360_EXPORTS_HOST` in your shell before `docker compose up -d`. `config: "sample"` is the fictional Contoso topology.

## Connect an AI client

The container must be running (`docker compose up -d`, container name `exchange-360`), and you must be signed in at `http://localhost:8360` for the tenant tools.

### Claude desktop (Windows)

1. Open Claude desktop. Click your name (bottom left), **Settings**, **Developer**, **Edit Config**. This opens `%APPDATA%\Claude\claude_desktop_config.json`.
2. Put this in the file (if it already has `mcpServers`, add the `exchange-360` entry inside it):

   ```json
   {
     "mcpServers": {
       "exchange-360": {
         "command": "docker",
         "args": ["exec", "-i", "exchange-360", "node", "server/mcp-stdio.mjs"]
       }
     }
   }
   ```

3. Save the file, then quit Claude desktop completely (right-click its icon in the system tray, **Quit**) and open it again.
4. In a new chat, click the **Search and tools** button (the sliders icon under the message box). **exchange-360** is listed with 18 tools.
5. Ask: "Use exchange-360 to show my sign-in status." Claude asks permission the first time it calls each tool.

### Claude Code

```powershell
claude mcp add --scope user exchange-360 -- docker exec -i exchange-360 node server/mcp-stdio.mjs
```

Then run `claude`, type `/mcp`, and check that **exchange-360** shows **connected**.

### Any other MCP client

Run `docker exec -i exchange-360 node server/mcp-stdio.mjs` as a stdio server. It speaks newline-delimited JSON-RPC (MCP protocol versions 2025-06-18, 2025-03-26 and 2024-11-05) and writes nothing else to stdout.

## Troubleshooting

| You see | Cause | Fix |
| --- | --- | --- |
| `Not signed in` | Nobody is signed in, or the container restarted (sign-ins are in memory only) | Open `http://localhost:8360`, click **Sign in**, finish MFA, ask again. |
| `Not authorized` | Your role cannot read that part | Same as on the page. See docs/auth.md, "Roles the signed-in person needs". |
| `No such container: exchange-360` | The container is stopped, or was started before this change with a different name | `docker compose up --build -d` in the Ex360 folder. |
| `Exchange 360 is not running in this container` | The server process has not written its key yet | Wait for `docker compose logs exchange-360` to say `listening`, then try again. |
| No export files listed | The export folder is empty, or not `%USERPROFILE%\Ex360-exports` | Run the export script, or set `EX360_EXPORTS_HOST` and restart the container. |

Each tool call is logged in the container log as `mcp.call` with the tool name and whether it failed. Arguments and answers are not logged.

## Code

| File | What |
| --- | --- |
| `lib/mcp.js` | The tools and the JSON-RPC handling. Pure: it gets `api` and `exports` from the server. |
| `server/index.mjs` | `/mcp` (POST, key required), the key file, which sign-in the tools use, and the read-only export folder. |
| `server/mcp-stdio.mjs` | The stdio bridge the AI client starts with `docker exec`. |
| `tests/mcp.test.mjs` | Protocol, every tool read-only, NextHop on the sample and on a file, path refusal, key and Origin checks, signed-out behaviour, and the bridge end to end. |
