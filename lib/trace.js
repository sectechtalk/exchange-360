import { numberSteps } from './walkthrough.js';

// Message trace in plain words: what each delivery status and each detail event means, and what to check next.
// Status and event names follow Get-MessageTraceV2 and Get-MessageTraceDetailV2 (Microsoft Learn, message trace
// in the modern EAC and the message trace FAQ, checked 2026-11-19).

export const STATUS = {
  delivered: { tone: 'ok', words: 'Delivered to the mailbox.', next: 'Delivered includes the Junk Email folder. Open the detail: if it shows a spam verdict, the user should look in Junk. Spam that was quarantined shows as Quarantined.' },
  failed: { tone: 'high', words: 'Not delivered.', next: 'Open the detail. The Fail or Drop event carries the reason, for example a mail flow rule, a recipient that does not exist, or a remote server that refused it. The sender also got an NDR with the same code.' },
  pending: { tone: 'medium', words: 'Delivery is being tried or retried.', next: 'The destination is slow or refusing for now. Exchange Online retries for up to 24 hours (48 for some cases) before it fails. Check the Defer event for the remote server\'s answer.' },
  expanded: { tone: 'info', words: 'Sent to a distribution group, which was expanded to its members.', next: 'Trace again for one member to see what happened to their copy.' },
  quarantined: { tone: 'medium', words: 'Held in quarantine.', next: 'Look the message up on the Quarantine page to see which policy held it and who can release it. Releasing is done in the Defender portal.' },
  filteredasspam: { tone: 'medium', words: 'Identified as spam and rejected or blocked, not quarantined.', next: 'Open the detail for the spam verdict, then run the message headers through Message hops if you have them.' },
  gettingstatus: { tone: 'info', words: 'Received very recently. No other status yet.', next: 'Search again in a few minutes. Status can lag 5 to 10 minutes.' },
  recalled: { tone: 'info', words: 'The sender recalled the message.', next: 'Nothing to fix. The sender used Outlook\'s recall.' },
  resolved: { tone: 'info', words: 'The recipient address was resolved to another address, for example by a proxy address or a forward.', next: 'Trace the new address to follow the message.' },
  none: { tone: 'info', words: 'No status reported.', next: 'Open the detail for events.' },
};

export function explainStatus(status) {
  const key = String(status || 'none').toLowerCase().replace(/[^a-z]/g, '');
  return STATUS[key] || { tone: 'info', words: `Status ${status}.`, next: 'Open the detail for events.' };
}

// Detail events. Matched by name; the Detail text carries the specifics.
const EVENTS = [
  { match: /^receive/i, tone: 'info', words: 'Exchange Online received the message.', next: '' },
  { match: /^submit/i, tone: 'info', words: 'The message was handed from the mailbox to transport.', next: '' },
  { match: /spam diagnostics|^spam/i, tone: 'medium', words: 'Spam filtering looked at the message.', next: 'The detail says spam, high confidence spam, phish or bulk, and the action taken. Check the anti-spam policy that applies to this recipient on Everything for one user.' },
  { match: /malware/i, tone: 'high', words: 'Malware filtering found something.', next: 'The message or attachment was blocked or quarantined by the anti-malware policy or Safe Attachments.' },
  { match: /transport rule|mail flow rule/i, tone: 'medium', words: 'A mail flow rule matched.', next: 'The detail names the rule. Open Mail flow rules to see its conditions and actions. If mail was blocked or redirected, this is usually why.' },
  { match: /dlp/i, tone: 'medium', words: 'A data loss prevention policy matched.', next: 'The detail names the DLP policy and rule. Check the DLP page for its mode: test mode only logs, Enable can block.' },
  { match: /^deliver/i, tone: 'ok', words: 'Delivered to the mailbox.', next: '' },
  { match: /send external|^send/i, tone: 'ok', words: 'Sent to a server outside Exchange Online.', next: 'The detail shows which server accepted it. After this point, delivery is the remote side\'s job.' },
  { match: /^fail/i, tone: 'high', words: 'Delivery failed.', next: 'The detail carries the NDR code (for example 550 5.1.10 or 550 5.7.1). Look it up on Playbooks.' },
  { match: /^drop/i, tone: 'high', words: 'The message was dropped without an NDR.', next: 'Usually a mail flow rule that deletes, or a malware or high-confidence phish action.' },
  { match: /^defer/i, tone: 'medium', words: 'Delivery was delayed and will be retried.', next: 'The detail carries the reason, such as a remote server not answering or a TLS requirement.' },
  { match: /^expand/i, tone: 'info', words: 'A group was expanded to its members.', next: '' },
  { match: /^redirect/i, tone: 'medium', words: 'The message was redirected to another recipient.', next: 'A mail flow rule or forwarding changed the recipient. Trace the new recipient.' },
  { match: /^resolve/i, tone: 'info', words: 'The recipient was resolved to another address.', next: '' },
  { match: /^transfer/i, tone: 'info', words: 'The message was split for some recipients, often because of a rule or conversion.', next: '' },
  { match: /moderat/i, tone: 'medium', words: 'The message waits for a moderator.', next: 'A moderated group or a rule sent it for approval. The moderator must approve it.' },
  { match: /quarantine/i, tone: 'medium', words: 'The message was quarantined.', next: 'See the Quarantine page.' },
  { match: /safe ?link|url/i, tone: 'info', words: 'Safe Links processed the links.', next: '' },
  { match: /safe ?attach|detonat/i, tone: 'info', words: 'Safe Attachments checked the attachments.', next: '' },
];

export function explainEvent(row) {
  const name = String(row.Event || row.event || '');
  const detail = String(row.Detail || row.detail || '');
  const hit = EVENTS.find(e => e.match.test(name)) || EVENTS.find(e => e.match.test(detail)) || { tone: 'info', words: name ? `${name}.` : 'Event.', next: '' };
  const parsed = parseRuleDetail(detail);
  const rule = (String(row.Data || '').match(/<MEP Name="(?:TransportRuleName|RuleName|PolicyName|DlpPolicyName)" String="([^"]+)"/i) || [])[1] || parsed.ruleName || parsed.dlpPolicy || '';
  const code = (detail.match(/\b([45]\d\d[ -][245]\.\d{1,3}\.\d{1,3})\b/) || [])[1] || '';
  const action = String(row.Action || row.action || '');
  return { name, detail, action, date: String(row.Date || row.date || ''), tone: hit.tone, words: hit.words, next: hit.next, rule, code, ...parsed };
}

// One-line verdict for the whole message from its detail events, newest decisive event first.
export function traceVerdict(events) {
  const list = (events || []).map(explainEvent);
  const decisive = [...list].reverse().find(e => /^(fail|drop|deliver|send|defer|quarantine)/i.test(e.name) || /quarantin/i.test(e.detail));
  const rule = list.find(e => e.rule);
  const spam = list.find(e => /spam/i.test(e.name));
  const parts = [];
  if (decisive) parts.push(`${decisive.words}${decisive.code ? ` Code ${decisive.code}.` : ''}`);
  if (rule) parts.push(`Rule or policy involved: ${rule.rule}.`);
  if (spam && /junk|jmf|spam folder/i.test(spam.detail)) parts.push('Spam filtering moved it to Junk Email.');
  else if (spam && /quarantin/i.test(spam.detail)) parts.push('Spam filtering quarantined it.');
  if (!parts.length) parts.push('No decisive event yet.');
  return { text: parts.join(' '), events: list };
}

// Fictional Contoso trace rows and details, shaped like the cmdlet output.
export const DEMO_TRACE = [
  { Received: '2026-11-18T14:02:14Z', SenderAddress: 'bounce@northwind.example', RecipientAddress: 'megan.bowen@contoso.com', Subject: 'Action required: update your deposit', Status: 'Quarantined', MessageId: '<abc123@northwind.example>', MessageTraceId: 'aaaaaaaa-0000-4000-8000-0000000000a1', FromIP: '203.0.113.50', Size: 18432 },
  { Received: '2026-11-18T09:15:04Z', SenderAddress: 'alex@fabrikam.example', RecipientAddress: 'adele.vance@contoso.com', Subject: '[External] Q4 shipping calendar', Status: 'Delivered', MessageId: '<clean-100@fabrikam.example>', MessageTraceId: 'aaaaaaaa-0000-4000-8000-0000000000a2', FromIP: '198.51.100.7', ToIP: '', Size: 40211 },
  { Received: '2026-11-18T08:40:00Z', SenderAddress: 'adele.vance@contoso.com', RecipientAddress: 'buyer@partner.example', Subject: 'Card details for the order', Status: 'Failed', MessageId: '<out-77@contoso.com>', MessageTraceId: 'aaaaaaaa-0000-4000-8000-0000000000a3', FromIP: '', ToIP: '', Size: 9120 },
  { Received: '2026-11-18T07:55:00Z', SenderAddress: 'megan.bowen@contoso.com', RecipientAddress: 'orders@slow.example', Subject: 'PO 4471', Status: 'Pending', MessageId: '<out-78@contoso.com>', MessageTraceId: 'aaaaaaaa-0000-4000-8000-0000000000a4', FromIP: '', ToIP: '192.0.2.25', Size: 5120 },
  { Received: '2026-11-18T09:15:04Z', SenderAddress: 'alex@fabrikam.example', RecipientAddress: 'megan.bowen@contoso.com', Subject: '[External] Q4 shipping calendar', Status: 'Delivered', MessageId: '<clean-100@fabrikam.example>', MessageTraceId: 'aaaaaaaa-0000-4000-8000-0000000000a5', FromIP: '198.51.100.7', ToIP: '', Size: 40211 },
];

export const DEMO_TRACE_DETAIL = {
  'aaaaaaaa-0000-4000-8000-0000000000a1': [
    { Date: '2026-11-18T14:02:14Z', Event: 'Receive', Action: '', Detail: 'Message received by: CO1PR00MB0001.prod.outlook.com', Data: '' },
    { Date: '2026-11-18T14:02:15Z', Event: 'Spam Diagnostics', Action: '', Detail: 'Phishing. Message was quarantined. Spoof (CAT:SPOOF) from northwind.example failed DMARC.', Data: '' },
    { Date: '2026-11-18T14:02:15Z', Event: 'Quarantine', Action: '', Detail: 'Message was quarantined by the anti-phishing policy Office365 AntiPhish Default.', Data: '' },
  ],
  'aaaaaaaa-0000-4000-8000-0000000000a2': [
    { Date: '2026-11-18T09:15:04Z', Event: 'Receive', Action: '', Detail: 'Message received by: CO1PR00MB0001.prod.outlook.com', Data: '' },
    { Date: '2026-11-18T09:15:06Z', Event: 'Transport rule', Action: 'Prepend subject', Detail: "Transport rule: 'Flag external spoof', ID: ('5C1D2E3F-0000-4000-8000-00000000E001'), DLP policy: '', ID: (00000000-0000-0000-0000-000000000000).", Data: '' },
    { Date: '2026-11-18T09:15:07Z', Event: 'Deliver', Action: '', Detail: 'The message was successfully delivered to the folder: Inbox', Data: '' },
  ],
  'aaaaaaaa-0000-4000-8000-0000000000a5': [
    { Date: '2026-11-18T09:15:04Z', Event: 'Receive', Action: '', Detail: 'Message received by: CO1PR00MB0001.prod.outlook.com', Data: '' },
    { Date: '2026-11-18T09:15:06Z', Event: 'Transport rule', Action: 'Prepend subject', Detail: "Transport rule: 'Flag external spoof', ID: ('5C1D2E3F-0000-4000-8000-00000000E001'), DLP policy: '', ID: (00000000-0000-0000-0000-000000000000).", Data: '' },
    { Date: '2026-11-18T09:15:07Z', Event: 'Deliver', Action: '', Detail: 'The message was successfully delivered to the folder: Inbox', Data: '' },
  ],
  'aaaaaaaa-0000-4000-8000-0000000000a3': [
    { Date: '2026-11-18T08:40:00Z', Event: 'Receive', Detail: 'Message received by: CO1PR00MB0001.prod.outlook.com', Data: '' },
    { Date: '2026-11-18T08:40:01Z', Event: 'DLP rule', Detail: 'Message matched DLP rule Block confidential subject in policy Sales confidential.', Data: '<MEP Name="DlpPolicyName" String="Sales confidential"/>' },
    { Date: '2026-11-18T08:40:01Z', Event: 'Fail', Detail: 'Reason: [{LED=550 5.7.1 Delivery not authorized, message refused by DLP};{MSG=};{FQDN=};{IP=};{LRT=}]', Data: '' },
  ],
  'aaaaaaaa-0000-4000-8000-0000000000a4': [
    { Date: '2026-11-18T07:55:00Z', Event: 'Receive', Detail: 'Message received by: CO1PR00MB0001.prod.outlook.com', Data: '' },
    { Date: '2026-11-18T07:56:30Z', Event: 'Defer', Detail: 'Reason: [{LED=451 4.4.0 Primary target IP address responded with: "421 4.3.2 Service not available"}]', Data: '' },
  ],
};

export function demoTrace({ sender = '', recipient = '', messageId = '', messageTraceId = '', subject = '', subjectFilter = 'StartsWith', status = '', related = false } = {}) {
  const low = s => String(s || '').toLowerCase();
  const subj = r => { const a = low(r.Subject); const b = low(subject); return subjectFilter === 'Contains' ? a.includes(b) : subjectFilter === 'EndsWith' ? a.endsWith(b) : a.startsWith(b); };
  const byRecipient = !related && recipient;
  const rows = DEMO_TRACE.filter(r => (related || !sender || low(r.SenderAddress) === low(sender)) && (!byRecipient || low(r.RecipientAddress) === low(recipient)) && (!messageId || low(r.MessageId) === low(messageId)) && (related || !subject || subj(r)) && (related || !status || low(r.Status) === low(status)));
  const commands = [{ ok: true, name: 'trace', value: rows }];
  if (messageTraceId) commands.push({ ok: true, name: 'detail', value: DEMO_TRACE_DETAIL[messageTraceId] || [] });
  return { ok: true, source: 'demo', mode: 'trace', commands };
}

// ---- Search arguments, the exact PowerShell, and what one message's detail tells an engineer.

const ZERO_GUID = /^0{8}-0{4}-0{4}-0{4}-0{12}$/;
const GUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
export const TRACE_STATUSES = ['Delivered', 'Failed', 'Pending', 'Quarantined', 'FilteredAsSpam', 'Expanded', 'GettingStatus'];
export const SUBJECT_FILTERS = ['StartsWith', 'Contains', 'EndsWith'];

// Clean the query string the page sends. Addresses are trimmed: a trailing space from a paste
// would otherwise make Get-MessageTraceV2 match nothing and look like "no messages".
export function normalizeTraceArgs(get) {
  const read = name => String(get(name) || '').trim();
  const status = read('status');
  const subjectFilter = read('subjectFilter');
  const id = read('messageTraceId');
  return {
    sender: read('sender').slice(0, 320),
    recipient: read('recipient').slice(0, 320),
    messageId: read('messageId').slice(0, 500),
    subject: read('subject').replace(/[\r\n]/g, ' ').slice(0, 256),
    subjectFilter: SUBJECT_FILTERS.includes(subjectFilter) ? subjectFilter : 'StartsWith',
    messageTraceId: GUID.test(id) ? id : '',
    status: TRACE_STATUSES.includes(status) ? status : '',
    days: Math.min(10, Math.max(1, Math.round(Number(read('days'))) || 10)),
    related: read('related') === '1',
  };
}

export function hasTraceFilter(args) {
  return Boolean(args.sender || args.recipient || args.messageId || args.subject);
}

const psq = v => `'${String(v).replace(/'/g, "''")}'`;

// The same Get-MessageTraceV2 command Ex360 runs, with the values filled in, so it can be pasted into
// Exchange Online PowerShell and compared.
export function traceCommand(args = {}) {
  const parts = ['Get-MessageTraceV2'];
  if (args.sender) parts.push(`-SenderAddress ${psq(args.sender)}`);
  if (args.recipient) parts.push(`-RecipientAddress ${psq(args.recipient)}`);
  if (args.messageId) parts.push(`-MessageId ${psq(args.messageId)}`);
  if (args.subject) parts.push(`-Subject ${psq(args.subject)} -SubjectFilterType ${args.subjectFilter || 'StartsWith'}`);
  if (args.status) parts.push(`-Status ${args.status}`);
  const days = Number(args.days) || 2;
  parts.push(`-StartDate (Get-Date).AddDays(-${days}) -EndDate (Get-Date) -ResultSize 200`);
  return parts.join(' ');
}

export function detailCommand(row = {}) {
  return `Get-MessageTraceDetailV2 -MessageTraceId ${row.MessageTraceId || '<MessageTraceId>'} -RecipientAddress ${psq(row.RecipientAddress || '')} | Format-List Date,Event,Action,Detail,Data`;
}

// Everything that shares the Message ID: every recipient, expansion and redirect of the same message.
export function relatedCommand(row = {}, days = 10) {
  return `Get-MessageTraceV2 -MessageId ${psq(row.MessageId || '')} -StartDate (Get-Date).AddDays(-${days}) -EndDate (Get-Date)`;
}

// Decide what the page shows for a trace answer. Anything that is not a clear list of rows is an
// error, so a failed read never reads as "No messages matched".
export function traceOutcome(data) {
  if (!data || typeof data !== 'object') return { kind: 'error', message: 'Ex360 got no answer from its server.' };
  if (data.authorized === false || data.label === 'Not authorized') return { kind: 'denied', value: data };
  if (data.ok === false && !Array.isArray(data.commands)) return { kind: 'error', message: data.detail || data.message || 'Message trace did not answer.' };
  const trace = (data.commands || []).find(c => c && c.name === 'trace');
  if (!trace) return { kind: 'error', message: 'Exchange Online PowerShell finished without returning the message trace. Nothing was searched, so this is not an empty result.' };
  if (trace.ok === false) {
    const error = String(trace.error || 'Get-MessageTraceV2 failed without a message.');
    return /not authorized|access denied|forbidden|does not have permission/i.test(error) ? { kind: 'denied', value: { label: 'Not authorized', authorized: false, message: error } } : { kind: 'error', message: error };
  }
  if (!Array.isArray(trace.value)) return { kind: 'error', message: 'Get-MessageTraceV2 returned something Ex360 could not read as rows.' };
  const rows = trace.value.filter(r => r && typeof r === 'object');
  return rows.length ? { kind: 'rows', rows } : { kind: 'empty', rows: [] };
}

// "Transport rule: 'External Source labeled [EXTERNAL] in subject.', ID: ('D80A...'), DLP policy: '', ID: (0000...)."
export function parseRuleDetail(detail) {
  const text = String(detail || '');
  const out = {};
  const rule = text.match(/Transport rule:\s*'((?:[^']|'(?!,\s*ID:))*)'\s*,\s*ID:\s*\(\s*'?([0-9a-fA-F-]{36})'?\s*\)/i);
  if (rule) {
    if (rule[1].trim()) out.ruleName = rule[1].trim();
    if (!ZERO_GUID.test(rule[2])) out.ruleId = rule[2].toUpperCase();
  }
  const dlp = text.match(/DLP policy:\s*'([^']*)'\s*,\s*ID:\s*\(\s*'?([0-9a-fA-F-]{36})'?\s*\)/i);
  if (dlp) {
    if (dlp[1].trim()) out.dlpPolicy = dlp[1].trim();
    if (!ZERO_GUID.test(dlp[2]) && dlp[1].trim()) out.dlpId = dlp[2].toUpperCase();
  }
  const dlpRule = text.match(/matched DLP rule (.+?) in policy (.+?)\.?$/i);
  if (dlpRule) { out.dlpRule = dlpRule[1].trim(); out.dlpPolicy = out.dlpPolicy || dlpRule[2].trim(); }
  const by = text.match(/received by:\s*([A-Za-z0-9.-]+)/i);
  if (by) out.receivedBy = by[1].replace(/\.$/, '');
  const folder = text.match(/delivered to the folder:\s*(.+?)\.?$/i);
  if (folder) out.folder = folder[1].trim();
  return out;
}

// Spam filter values the detail can carry (S:SFA custom data or the Spam Diagnostics text).
export function parseSpam(text) {
  const t = String(text || '');
  const pick = re => (t.match(re) || [])[1] || '';
  const out = { scl: pick(/\bSCL[=:](-?\d+)/i), sfv: pick(/\bSFV[=:]([A-Z]+)/i), cat: pick(/\bCAT[=:]([A-Z]+)/i), country: pick(/\bCTRY[=:]([A-Z]{2})/i) };
  return Object.values(out).some(Boolean) ? out : null;
}

export function toTime(value) {
  if (value == null || value === '') return NaN;
  const s = String(value);
  // Ex360 asks PowerShell for UTC with a Z. A bare date-time from older output is treated as UTC too.
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s) ? `${s}Z` : s;
  return Date.parse(iso);
}

export function formatGap(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min${s % 60 ? ` ${s % 60} s` : ''}`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h${m % 60 ? ` ${m % 60} min` : ''}`;
  return `${Math.floor(h / 24)} days ${h % 24} h`;
}

export function formatUtc(value) {
  const t = toTime(value);
  if (!Number.isFinite(t)) return String(value || '');
  return new Date(t).toISOString().replace('T', ' ').replace(/\.\d+Z$/, '').replace(/Z$/, '');
}

// Each event with the time since the previous one, and the total time inside Exchange Online.
export function eventTimeline(events) {
  const list = (events || []).map(r => ({ row: r, at: toTime(r.Date || r.date) }));
  let prev = NaN;
  const steps = list.map(({ row, at }) => {
    const gap = Number.isFinite(prev) && Number.isFinite(at) ? at - prev : NaN;
    if (Number.isFinite(at)) prev = at;
    return { ...explainEvent(row), date: row.Date || row.date || '', gapMs: gap, gap: formatGap(gap) };
  });
  const times = list.map(x => x.at).filter(Number.isFinite);
  const totalMs = times.length > 1 ? Math.max(...times) - Math.min(...times) : NaN;
  const slowest = steps.reduce((best, s) => (Number.isFinite(s.gapMs) && (!best || s.gapMs > best.gapMs) ? s : best), null);
  return { steps, totalMs, total: formatGap(totalMs), slowest: slowest && slowest.gapMs >= 60000 ? slowest : null };
}

export function formatSize(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n < 1024) return `${n} bytes`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB (${n.toLocaleString('en-US')} bytes)`;
  return `${(n / 1024 / 1024).toFixed(2)} MB (${n.toLocaleString('en-US')} bytes)`;
}

// Direction from the IPs, the way the portal describes them: From IP is blank for mail sent from
// Exchange Online; To IP is blank for mail delivered into Exchange Online.
export function directionOf(row = {}) {
  const from = String(row.FromIP || '').trim();
  const to = String(row.ToIP || '').trim();
  if (from && !to) return 'Inbound: arrived from outside and was delivered inside Exchange Online.';
  if (!from && to) return 'Outbound: sent from Exchange Online to a server outside.';
  if (!from && !to) return 'Internal: sent and delivered inside Exchange Online.';
  return 'Relayed: arrived from outside and was sent back out.';
}

// The "More information" section of the portal's details flyout, plus what the events add.
export function messageFacts(row = {}, events = []) {
  const steps = (events || []).map(explainEvent);
  const receivedBy = steps.map(s => s.receivedBy).find(Boolean) || '';
  const folder = steps.map(s => s.folder).find(Boolean) || '';
  const tl = eventTimeline(events);
  return [
    ['Message ID', row.MessageId || ''],
    ['Message size', formatSize(row.Size)],
    ['From IP', row.FromIP || 'Blank (sent from Exchange Online)'],
    ['To IP', row.ToIP || 'Blank (delivered inside Exchange Online)'],
    ['Direction', directionOf(row)],
    ['Message trace ID (Network Message ID)', row.MessageTraceId || ''],
    ['Received by server', receivedBy],
    ['Delivered to folder', folder],
    ['Time inside Exchange Online', tl.total ? `${tl.total}, from the first event to the last` : ''],
  ].filter(([, v]) => v !== '');
}

// Mail flow rules and DLP policies that acted on the message, with the action taken.
export function rulesHit(events = []) {
  const out = [];
  for (const e of (events || []).map(explainEvent)) {
    if (e.ruleName || e.ruleId) out.push({ kind: 'Mail flow rule', name: e.ruleName || '', id: e.ruleId || '', action: e.action || '', date: e.date || '' });
    if (e.dlpPolicy) out.push({ kind: 'DLP policy', name: e.dlpPolicy, rule: e.dlpRule || '', id: e.dlpId || '', action: e.action || '' });
    else if (!e.ruleName && e.rule && /transport rule|mail flow rule/i.test(e.name)) out.push({ kind: 'Mail flow rule', name: e.rule, id: '', action: e.action || '' });
  }
  return out;
}

export function signedOutTrace() {
  return { ok: false, signedOut: true, authorized: true, label: 'Signed out', message: 'Ex360 does not see you signed in, so it did not search your tenant. This happens after Ex360 restarts (docker compose up) or in a browser where you have not signed in. Select Sign in in the left pane, wait for LIVE at the top, then try again.' };
}

// A details answer from the Contoso sample for a row that came from the live tenant is a sign-in
// problem, not "no events".
export function detailMismatch(rowSource, data) {
  return rowSource === 'live' && data && data.source === 'demo';
}

// ---- Walkthrough: one line per event, saying which component touched the message and what it did.

const shortServer = name => String(name || '').split('.')[0];
function prefixTag(subject) {
  const m = String(subject || '').match(/^\s*(\[[^\]]{1,40}\]|[A-Z]{2,12}:)/);
  return m ? m[1] : '';
}
const RULE_ACTIONS = [
  [/prepend subject/i, (e, row) => { const tag = prefixTag(row.Subject); return tag ? `added "${tag}" to the start of the subject` : 'added text to the start of the subject'; }],
  [/set ?scl|spam confidence/i, () => 'set the spam confidence level'],
  [/set ?header|header/i, () => 'set a message header'],
  [/disclaimer/i, () => 'added a disclaimer'],
  [/redirect/i, () => 'redirected the message'],
  [/reject|delete|drop/i, () => 'blocked the message'],
  [/quarantine/i, () => 'sent the message to quarantine'],
  [/bcc|blind ?copy|add ?to ?recipient|copy ?to/i, () => 'added a recipient'],
  [/moderat/i, () => 'sent the message for approval'],
  [/encrypt|ome|rights/i, () => 'applied encryption'],
  [/route|connector/i, () => 'routed the message through a connector'],
];
function ruleWords(e, row) {
  const hit = RULE_ACTIONS.find(([re]) => re.test(e.action || ''));
  if (hit) return hit[1](e, row);
  return e.action ? `ran its action: ${e.action}` : 'matched';
}

export function traceWalkthroughSteps(row = {}, events = []) {
  const steps = [];
  for (const raw of events || []) {
    const e = explainEvent(raw);
    const name = e.name.toLowerCase();
    let component = 'Exchange Online';
    let text = '';
    if (/^receive/.test(name)) {
      const by = e.receivedBy ? ` server ${shortServer(e.receivedBy)}` : '';
      component = `Exchange Online transport${e.receivedBy ? ` (${shortServer(e.receivedBy)})` : ''}`;
      text = row.FromIP ? `Received from ${row.FromIP} by Exchange Online${by}.` : `Received from a sender inside Exchange Online${by ? ` by${by}` : ''}.`;
    } else if (/^submit/.test(name)) {
      component = 'Mailbox transport submission';
      text = `Handed from the sender's mailbox to transport.`;
    } else if (/transport rule|mail flow rule/.test(name)) {
      component = 'Mail flow rules (transport rule agent)';
      text = `Mail flow rule "${e.ruleName || e.rule || 'unnamed'}" ${ruleWords(e, row)}.`;
    } else if (/dlp/.test(name) || e.dlpPolicy) {
      component = 'Data loss prevention';
      text = `DLP policy "${e.dlpPolicy || e.rule || 'unnamed'}"${e.dlpRule ? ` (rule "${e.dlpRule}")` : ''} matched${e.action ? `: ${e.action}` : ''}.`;
    } else if (/spam/.test(name)) {
      const v = parseSpam(`${e.detail} ${raw.Data || ''}`);
      component = 'Exchange Online Protection spam filter';
      text = `Spam filtering checked it${v?.scl ? `, SCL ${v.scl}` : ''}${v?.sfv ? `, verdict ${v.sfv}` : ''}${v?.cat ? `, category ${v.cat}` : ''}. ${e.detail}`.trim();
    } else if (/malware/.test(name)) {
      component = 'Anti-malware filter';
      text = `Malware filtering acted: ${e.detail || 'see detail'}.`;
    } else if (/safe ?attach|detonat/.test(name)) {
      component = 'Defender Safe Attachments';
      text = 'Attachments were checked.';
    } else if (/safe ?link|url/.test(name)) {
      component = 'Defender Safe Links';
      text = 'Links were checked.';
    } else if (/quarantine/.test(name)) {
      component = 'Quarantine';
      text = `Held in quarantine. ${e.detail}`.trim();
    } else if (/^expand/.test(name)) {
      component = 'Recipient resolution';
      text = 'A group was expanded to its members.';
    } else if (/^redirect/.test(name)) {
      component = 'Recipient resolution';
      text = `Redirected to another recipient. ${e.detail}`.trim();
    } else if (/^resolve/.test(name)) {
      component = 'Recipient resolution';
      text = `The recipient address was resolved to another address. ${e.detail}`.trim();
    } else if (/^transfer/.test(name)) {
      component = 'Exchange Online transport';
      text = 'The message was split into a copy for some recipients.';
    } else if (/^deliver/.test(name)) {
      component = 'Mailbox delivery';
      text = `Delivered to ${row.RecipientAddress || 'the recipient'}'s mailbox${e.folder ? `, folder ${e.folder}` : ''}.`;
    } else if (/send external|^send/.test(name)) {
      component = 'Outbound transport';
      text = `Sent out of Exchange Online${row.ToIP ? ` to ${row.ToIP}` : ''}.`;
    } else if (/^defer/.test(name)) {
      component = 'Outbound transport';
      text = `Delivery was delayed and will be retried${e.code ? ` (${e.code})` : ''}.`;
    } else if (/^fail/.test(name)) {
      component = 'Exchange Online transport';
      text = `Delivery failed${e.code ? ` with ${e.code}` : ''}. The sender gets a non-delivery report.`;
    } else if (/^drop/.test(name)) {
      component = 'Exchange Online transport';
      text = 'The message was dropped without a non-delivery report.';
    } else if (/moderat/.test(name)) {
      component = 'Moderation';
      text = 'Waiting for a moderator to approve it.';
    } else {
      text = `${e.name || 'Event'}${e.action ? `: ${e.action}` : ''}. ${e.detail}`.trim();
    }
    steps.push({ time: raw.Date || raw.date || '', component, text, tone: e.tone });
  }
  return numberSteps(steps);
}
