// Exchange 360 MCP server: the Model Context Protocol tools an AI client (Claude desktop, Claude Code) can call.
// Pure: no network, file or Node APIs. The server passes in `api` (a GET against Ex360's own /api routes with the
// signed-in browser session) and `exportsDir` (read-only access to the mail flow export files).
// Every tool only reads. Nothing here changes the tenant, and there is no tool that could.
import { analyze } from './analyzer.js';
import { predict, nextHopText, checkExport, topologyRows, AUTH_RESULTS, VERDICTS, MESSAGE_KINDS } from './nexthop.js';
import { sampleExport } from './nexthop-sample.js';
import { SCENARIOS } from './nexthop-scenarios.js';
import { TRACE_STATUSES, SUBJECT_FILTERS } from './trace.js';

export const MCP_PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
export const MCP_SERVER_INFO = { name: 'exchange-360', title: 'Exchange 360', version: '0.1.0' };
// Largest tool answer handed to the AI client. Bigger answers are cut and say so.
export const MAX_TEXT = 150000;

export const MCP_INSTRUCTIONS = [
  'Exchange 360 reads one Exchange Online tenant with the permissions of the person signed in to Exchange 360 at http://localhost:8360.',
  'Every tool is read-only. None of them can change the tenant.',
  'If a tool says "Not signed in", ask the person to open http://localhost:8360 and click Sign in, then try again.',
  'If a tool says "Not authorized", the signed-in person\'s role cannot read that part. Say so; do not guess the value.',
  'NextHop tools predict mail flow from configuration only (the Contoso sample or an export file). They never send mail.',
].join(' ');

export class NotSignedIn extends Error {
  constructor() {
    super('Not signed in. Open http://localhost:8360 in a browser, click Sign in, finish the MFA prompt, then ask again. Exchange 360 keeps sign-ins in memory only, so restarting the container signs you out.');
    this.name = 'NotSignedIn';
  }
}

const str = v => (v == null ? '' : String(v));
const ORG_PARTS = ['settings', 'domains', 'licenses', 'remoteDomains', 'connectors', 'transportRules', 'antiSpam', 'antiPhish', 'safeLinks', 'safeAttachments', 'quarantine', 'config', 'health'];
const ORG_PICK = { licenses: 'skus' };
const EXPORT_NAME = /^[\w.\- ()]{1,200}\.json$/i;

const prop = (type, description, extra = {}) => ({ type, description, ...extra });
const readOnly = (title, openWorld = true) => ({ title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: openWorld });

const nextHopMessageProps = {
  config: prop('string', 'Which configuration to predict against: "sample" for the fictional Contoso topology, or the file name of an export from ex360_nexthop_list_exports (for example mailflow-config-...json).'),
  scenario: prop('string', `Optional. Start from a ready-made test message: ${SCENARIOS.map(s => s.id).join(', ')}. Any other field you pass replaces the scenario's value.`),
  direction: prop('string', 'inbound (outside sender to the mailbox) or outbound (the mailbox to an outside address).', { enum: ['inbound', 'outbound'] }),
  externalAddress: prop('string', 'The made-up outside address. Nothing is looked up or sent.'),
  fromName: prop('string', 'Inbound only: the From display name of the outside sender.'),
  ip: prop('string', 'Inbound only: the mocked sending IP. Trips connection filter, connector IP scoping and IP conditions.'),
  auth: prop('string', 'Inbound only: the mocked sender authentication result.', { enum: Object.keys(AUTH_RESULTS) }),
  verdict: prop('string', 'Inbound only: the mocked spam filter verdict.', { enum: Object.keys(VERDICTS) }),
  bcl: prop('number', 'Inbound only: the mocked bulk complaint level, 0 to 9.'),
  malware: prop('boolean', 'Inbound only: true if an attachment should be treated as malware.'),
  subject: prop('string', 'Subject of the test message. Phrases here can trip mail flow rules and DLP.'),
  body: prop('string', 'Body of the test message. Phrases, card numbers and URLs here can trip mail flow rules, DLP and Safe Links.'),
  attachments: prop('string', 'Attachments as "name (size)", separated by commas, for example "invoice.pdf (300 KB), setup.exe (2 MB)".'),
  kind: prop('string', 'normal, autoforward (inbox rule or mailbox forwarding) or autoreply (out of office).', { enum: Object.keys(MESSAGE_KINDS) }),
  label: prop('string', 'Outbound only: the sensitivity label the sender applies.'),
};

// name, annotations, description, input schema, and run({ args, api, exports }).
export const MCP_TOOLS = [
  {
    name: 'ex360_status',
    annotations: readOnly('Sign-in status', false),
    description: 'Who is signed in to Exchange 360 and which connections are ready (Graph, Exchange Online, Purview Graph, Compliance PowerShell). Call this first when another tool says Not signed in or Not authorized.',
    inputSchema: { type: 'object', properties: {} },
    run: async ({ api }) => {
      const s = await api('/api/session', {}, { signIn: false });
      // The page's signed-out hint; it reads as a contradiction next to signedIn true.
      if (s?.signedIn) delete s.consent;
      return s;
    },
  },
  {
    name: 'ex360_setup_check',
    annotations: readOnly('Setup steps check'),
    description: 'Runs the Exchange 360 Setup steps checks: app registration, admin consent, redirect URIs, the signed-in person\'s roles, and a live Exchange Online connection test.',
    inputSchema: { type: 'object', properties: {} },
    run: ({ api }) => api('/api/setup', { live: '1' }, { signIn: false }),
  },
  {
    name: 'ex360_org',
    annotations: readOnly('Organization configuration'),
    description: `Organization-wide Exchange Online configuration as Exchange 360's Organization pages show it. Pick one part: ${ORG_PARTS.join(', ')}. "settings" is every organization setting with Configured or Not configured. "all" returns everything (large).`,
    inputSchema: { type: 'object', properties: { part: prop('string', 'The part to return.', { enum: [...ORG_PARTS, 'all'] }) }, required: ['part'] },
    run: async ({ args, api }) => {
      const org = await api('/api/org');
      const part = str(args.part) || 'settings';
      if (part === 'all' || org.ok === false) return org;
      if (!ORG_PARTS.includes(part)) return { ok: false, message: `Unknown part "${part}". Use one of: ${ORG_PARTS.join(', ')}, all.` };
      const key = ORG_PICK[part] || part;
      return { source: org.source, tenant: org.tenant, part, value: org[key] ?? null, ...(part === 'settings' ? { settingsErrors: org.settingsErrors } : {}), exchangeError: org.exchangeError || null };
    },
  },
  {
    name: 'ex360_search_recipients',
    annotations: readOnly('Search recipients'),
    description: 'Search every recipient that can receive mail (users, shared and resource mailboxes, groups, distribution lists, contacts, mail-enabled public folders) by name or address. Returns ids to pass to ex360_recipient and ex360_recipient_report.',
    inputSchema: { type: 'object', properties: { q: prop('string', 'Part of a display name or email address. At least 2 characters.') }, required: ['q'] },
    run: ({ args, api }) => {
      const q = str(args.q).trim();
      if (q.length < 2) return { ok: false, message: 'Type at least 2 characters to search.' };
      return api('/api/mailboxes', { q });
    },
  },
  {
    name: 'ex360_recipient',
    annotations: readOnly('Recipient properties'),
    description: 'Everything Exchange 360 shows for one recipient on the SINGLE RECIPIENT page: mailbox properties, licences, forwarding, delegation, inbox rules, policies that apply, and the Exchange Online view.',
    inputSchema: {
      type: 'object',
      properties: {
        id: prop('string', 'The recipient\'s email address or the id from ex360_search_recipients.'),
        source: prop('string', 'Where the id came from in ex360_search_recipients (default user).', { enum: ['user', 'group', 'contact', 'exo'] }),
      },
      required: ['id'],
    },
    run: ({ args, api }) => api('/api/mailbox', { id: str(args.id), source: str(args.source) || 'user' }),
  },
  {
    name: 'ex360_recipient_report',
    annotations: readOnly('Recipient report'),
    description: 'The full "Everything for one recipient" report for one mailbox (the same content as the PDF report), with Not authorized marked on any part the signed-in role cannot read.',
    inputSchema: { type: 'object', properties: { id: prop('string', 'The mailbox email address or id.'), timeZone: prop('string', 'IANA time zone for times in the report, for example America/Los_Angeles.') }, required: ['id'] },
    run: ({ args, api }) => api('/api/report', { id: str(args.id), tz: str(args.timeZone) }),
  },
  {
    name: 'ex360_signins',
    annotations: readOnly('Recent sign-ins'),
    description: 'The last sign-ins for one user from Entra sign-in logs (needs Entra ID P1 or higher).',
    inputSchema: { type: 'object', properties: { upn: prop('string', 'The user principal name, for example someone@contoso.com.') }, required: ['upn'] },
    run: ({ args, api }) => api('/api/signins', { upn: str(args.upn) }),
  },
  {
    name: 'ex360_recipients',
    annotations: readOnly('Recipients list'),
    description: 'Recipient lists as the Exchange admin center shows them: shared mailboxes, resource mailboxes, groups, contacts and mail users.',
    inputSchema: { type: 'object', properties: {} },
    run: ({ api }) => api('/api/recipients'),
  },
  {
    name: 'ex360_message_trace',
    annotations: readOnly('Message trace'),
    description: 'Exchange Online message trace (Get-MessageTraceV2) for the last 1 to 10 days. Give at least one of sender, recipient, messageId or subject. The answer includes the exact PowerShell command that was run.',
    inputSchema: {
      type: 'object',
      properties: {
        sender: prop('string', 'Sender address.'),
        recipient: prop('string', 'Recipient address.'),
        messageId: prop('string', 'Internet Message-ID, with or without angle brackets.'),
        subject: prop('string', 'Subject text.'),
        subjectFilter: prop('string', 'How subject matches.', { enum: SUBJECT_FILTERS }),
        status: prop('string', 'Only messages with this status.', { enum: TRACE_STATUSES }),
        days: prop('number', 'How many days back, 1 to 10 (default 10).'),
        messageTraceId: prop('string', 'A MessageTraceId GUID from an earlier trace row, to read that message\'s detail events.'),
      },
    },
    run: ({ args, api }) => {
      const params = {};
      for (const k of ['sender', 'recipient', 'messageId', 'subject', 'subjectFilter', 'status', 'days', 'messageTraceId']) if (args[k] != null && args[k] !== '') params[k] = str(args[k]);
      return api('/api/trace', params);
    },
  },
  {
    name: 'ex360_quarantine',
    annotations: readOnly('Quarantine'),
    description: 'Quarantined messages (Get-QuarantineMessage) for the last 1 to 30 days, optionally for one recipient or sender. Read-only: it cannot release or delete.',
    inputSchema: { type: 'object', properties: { recipient: prop('string', 'Recipient address.'), sender: prop('string', 'Sender address.'), days: prop('number', 'Days back, 1 to 30 (default 14).') } },
    run: ({ args, api }) => api('/api/quarantine', { recipient: str(args.recipient), sender: str(args.sender), days: str(args.days || '') }),
  },
  {
    name: 'ex360_compliance',
    annotations: readOnly('Compliance and auditing'),
    description: 'Purview and compliance view: DLP, retention, sensitivity labels, eDiscovery cases, Conditional Access, admin roles, migrations and admin audit. Optional user and operation narrow the audit search.',
    inputSchema: { type: 'object', properties: { user: prop('string', 'Narrow the audit search to this user.'), operation: prop('string', 'Narrow the audit search to this operation, for example New-InboxRule.') } },
    run: ({ args, api }) => api('/api/compliance', { user: str(args.user), operation: str(args.operation) }),
  },
  {
    name: 'ex360_message_headers',
    annotations: readOnly('Read and analyze a message\'s headers'),
    description: 'Reads one message\'s internet headers from a mailbox through Microsoft Graph (Mail.Read with the signed-in person\'s access) and explains them: hops, SPF, DKIM, DMARC, ARC, composite authentication, spam and phishing verdicts.',
    inputSchema: { type: 'object', properties: { user: prop('string', 'The mailbox address that holds the message.'), internetMessageId: prop('string', 'The message\'s Internet Message-ID.') }, required: ['user', 'internetMessageId'] },
    run: async ({ args, api }) => {
      const got = await api('/api/headers', { user: str(args.user), internetMessageId: str(args.internetMessageId) });
      if (!got?.headers) return got;
      return { source: got.source, ...got, analysis: analyze(got.headers) };
    },
  },
  {
    name: 'ex360_analyze_headers',
    annotations: readOnly('Analyze pasted headers', false),
    description: 'Explains pasted message headers in plain words: every hop, SPF, DKIM, DMARC and alignment, ARC, composite authentication, SCL, BCL, phishing and spoof verdicts, and DLP signals. Works offline and needs no sign-in.',
    inputSchema: { type: 'object', properties: { headers: prop('string', 'The full header block, as copied from Outlook or a .eml file.') }, required: ['headers'] },
    run: ({ args }) => {
      const raw = str(args.headers);
      if (!raw.trim()) return { ok: false, message: 'Paste the header block.' };
      return analyze(raw.slice(0, 500000));
    },
  },
  {
    name: 'ex360_dns_check',
    annotations: readOnly('Public DNS mail checks'),
    description: 'Public DNS mail checks for one domain: MX, SPF, DKIM selectors, DMARC, MTA-STS and TLS-RPT. Uses public DNS only; needs no sign-in.',
    inputSchema: { type: 'object', properties: { domain: prop('string', 'The domain, for example contoso.com.') }, required: ['domain'] },
    run: ({ args, api }) => api('/api/dns', { domain: str(args.domain).trim().toLowerCase() }, { signIn: false }),
  },
  {
    name: 'ex360_nexthop_list_exports',
    annotations: readOnly('List mail flow exports', false),
    description: 'Lists the mail flow configuration exports (Export-MailFlowConfig.ps1 output) Exchange 360 can read for NextHop, plus "sample" for the fictional Contoso topology.',
    inputSchema: { type: 'object', properties: {} },
    run: async ({ exports }) => ({ folder: exports.folder, value: [{ name: 'sample', note: 'Fictional Contoso sample topology. Not your tenant.' }, ...(await exports.list())] }),
  },
  {
    name: 'ex360_nexthop_scenarios',
    annotations: readOnly('NextHop example messages', false),
    description: 'The ready-made NextHop test messages (id, what each one shows, and its input). Pass an id as "scenario" to ex360_nexthop_predict.',
    inputSchema: { type: 'object', properties: {} },
    run: () => ({ value: SCENARIOS }),
  },
  {
    name: 'ex360_nexthop_topology',
    annotations: readOnly('NextHop topology at a glance', false),
    description: 'What a mail flow configuration holds, one row per area (connectors, rules, policies, DLP, labels, inbox rules and more), with each section\'s read status.',
    inputSchema: { type: 'object', properties: { config: nextHopMessageProps.config }, required: ['config'] },
    run: async ({ args, exports }) => {
      const cfg = await loadConfig(args.config, exports);
      if (cfg.ok === false) return cfg;
      return { source: cfg.sample ? 'sample' : 'export', tenant: cfg.tenant?.organization || '', generatedAt: cfg.generatedAt || null, mailbox: cfg.mailbox?.address || '', areas: topologyRows(cfg) };
    },
  },
  {
    name: 'ex360_nexthop_predict',
    annotations: readOnly('NextHop: predict mail flow', false),
    description: 'Predicts, from configuration only, every step Exchange Online would apply to one test message between the configuration\'s mailbox and a made-up outside address, in order: what happens, why, and the exact setting behind it. Nothing is sent and no tenant is touched.',
    inputSchema: { type: 'object', properties: nextHopMessageProps, required: ['config'] },
    run: async ({ args, exports }) => {
      const cfg = await loadConfig(args.config, exports);
      if (cfg.ok === false) return cfg;
      let input = {};
      if (args.scenario) {
        const scenario = SCENARIOS.find(s => s.id === args.scenario);
        if (!scenario) return { ok: false, message: `No scenario "${args.scenario}". Use one of: ${SCENARIOS.map(s => s.id).join(', ')}.` };
        input = { ...scenario.input };
      }
      for (const k of Object.keys(nextHopMessageProps)) if (k !== 'config' && k !== 'scenario' && args[k] != null) input[k] = args[k];
      const result = predict(cfg, input);
      return { text: nextHopText(result), outcome: result.outcome, where: result.where, ndr: result.ndr || null, encrypted: result.encrypted, steps: result.steps.map(s => ({ n: s.n, component: s.component, text: s.text, tone: s.tone })), settings: result.settings, copies: result.copies, unknowns: result.unknowns, source: result.source, tenant: result.tenant };
    },
  },
];

async function loadConfig(name, exports) {
  const n = str(name).trim();
  if (!n || n.toLowerCase() === 'sample') return sampleExport();
  if (!EXPORT_NAME.test(n) || n.includes('/') || n.includes('\\') || n.startsWith('.')) return { ok: false, message: 'Give the export\'s file name only, as ex360_nexthop_list_exports lists it.' };
  let cfg;
  try {
    cfg = JSON.parse(await exports.read(n));
  } catch (error) {
    return { ok: false, message: error.code === 'ENOENT' ? `There is no export named ${n} in ${exports.folder}. Run ex360_nexthop_list_exports.` : `${n} could not be read: ${error.message}` };
  }
  const check = checkExport(cfg);
  return check.ok ? cfg : { ok: false, message: check.message };
}

export function toolText(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 1);
  if (text.length <= MAX_TEXT) return text;
  return `${text.slice(0, MAX_TEXT)}\n\n[Cut at ${MAX_TEXT} characters of ${text.length}. Ask for a narrower part, for example one ex360_org part or a narrower trace.]`;
}

function isFailure(value) {
  return Boolean(value && typeof value === 'object' && value.ok === false);
}

export function listTools() {
  return MCP_TOOLS.map(({ name, annotations, description, inputSchema }) => ({ name, title: annotations.title, description, inputSchema, annotations }));
}

export async function callTool(name, args, deps) {
  const tool = MCP_TOOLS.find(t => t.name === name);
  if (!tool) return { content: [{ type: 'text', text: `Unknown tool ${name}.` }], isError: true };
  try {
    const value = await tool.run({ args: args && typeof args === 'object' ? args : {}, ...deps });
    return { content: [{ type: 'text', text: toolText(value) }], ...(isFailure(value) ? { isError: true } : {}) };
  } catch (error) {
    return { content: [{ type: 'text', text: error instanceof NotSignedIn ? error.message : `Exchange 360 could not answer: ${error.message}` }], isError: true };
  }
}

const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

// One JSON-RPC message in, one response out (null for a notification).
export async function handleRpc(msg, deps) {
  if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return rpcError(msg?.id, -32600, 'Invalid request');
  const isNotification = msg.id === undefined;
  const ok = result => (isNotification ? null : { jsonrpc: '2.0', id: msg.id, result });
  switch (msg.method) {
    case 'initialize': {
      const asked = msg.params?.protocolVersion;
      return ok({
        protocolVersion: MCP_PROTOCOL_VERSIONS.includes(asked) ? asked : MCP_PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: MCP_SERVER_INFO,
        instructions: MCP_INSTRUCTIONS,
      });
    }
    case 'ping': return ok({});
    case 'tools/list': return ok({ tools: listTools() });
    case 'tools/call': return ok(await callTool(msg.params?.name, msg.params?.arguments, deps));
    default:
      if (isNotification || msg.method.startsWith('notifications/')) return null;
      return rpcError(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}
