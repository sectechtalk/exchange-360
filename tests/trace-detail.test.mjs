import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeTraceArgs, hasTraceFilter, traceCommand, detailCommand, relatedCommand, traceOutcome, parseRuleDetail, parseSpam, eventTimeline, messageFacts, rulesHit, explainEvent, formatUtc, demoTrace, directionOf } from '../lib/trace.js';

// Shaped like real Get-MessageTraceDetailV2 output from a live tenant on 2026-11-19, with fictional names and IDs.
const LIVE = [
  { Date: '2026-11-19T22:30:23Z', Event: 'Receive', Action: '', Detail: 'Message received by: CO1PR00MB0001.NAMP000.PROD.OUTLOOK.COM' },
  { Date: '2026-11-19T22:30:25Z', Event: 'Transport rule', Action: 'Prepend subject', Detail: "Transport rule: 'External Source labeled [EXTERNAL] in subject.', ID: ('5C1D2E3F-0000-4000-8000-00000000E001'), DLP policy: '', ID: (00000000-0000-0000-0000-000000000000)." },
  { Date: '2026-11-19T22:30:26Z', Event: 'Deliver', Action: '', Detail: 'The message was successfully delivered.' },
];

test('search arguments are trimmed so a pasted space cannot hide every message', () => {
  const q = new URLSearchParams({ sender: '  sender@fabrikam.example ', days: '2', status: '' });
  const a = normalizeTraceArgs(n => q.get(n));
  assert.equal(a.sender, 'sender@fabrikam.example');
  assert.equal(a.days, 2);
  assert.equal(a.status, '');
  assert.equal(a.related, false);
  assert.equal(normalizeTraceArgs(n => ({ status: 'Bogus; Remove-Item', messageTraceId: 'nope', subjectFilter: 'x' })[n]).status, '');
  assert.equal(normalizeTraceArgs(() => null).days, 10);
  assert.equal(hasTraceFilter(normalizeTraceArgs(() => null)), false);
  assert.equal(hasTraceFilter(normalizeTraceArgs(n => (n === 'subject' ? 'Invoice' : null))), true);
});

test('the command shown is the command that works in PowerShell, with real values', () => {
  const cmd = traceCommand({ sender: 'sender@fabrikam.example', days: 2 });
  assert.equal(cmd, "Get-MessageTraceV2 -SenderAddress 'sender@fabrikam.example' -StartDate (Get-Date).AddDays(-2) -EndDate (Get-Date) -ResultSize 200");
  assert.doesNotMatch(cmd, /<sender>/);
  assert.match(traceCommand({ subject: "O'Brien", subjectFilter: 'Contains', status: 'Quarantined', days: 7 }), /-Subject 'O''Brien' -SubjectFilterType Contains -Status Quarantined -StartDate \(Get-Date\)\.AddDays\(-7\)/);
  assert.match(detailCommand({ MessageTraceId: 'abc', RecipientAddress: 'megan.bowen@contoso.com' }), /^Get-MessageTraceDetailV2 -MessageTraceId abc -RecipientAddress 'megan.bowen@contoso.com' \| Format-List/);
  assert.match(relatedCommand({ MessageId: '<x@y>' }, 2), /-MessageId '<x@y>'/);
});

test('a failed or missing read is an error, never "No messages matched"', () => {
  assert.equal(traceOutcome(null).kind, 'error');
  assert.equal(traceOutcome({ ok: false, message: 'Exchange Online PowerShell did not finish in time.' }).kind, 'error');
  assert.equal(traceOutcome({ ok: true, commands: [] }).kind, 'error');
  assert.equal(traceOutcome({ ok: true }).kind, 'error');
  assert.equal(traceOutcome({ ok: true, commands: [{ name: 'trace', ok: false, error: 'The term Get-MessageTraceV2 is not recognized' }] }).kind, 'error');
  assert.equal(traceOutcome({ ok: true, commands: [{ name: 'trace', ok: false, error: 'Access Denied' }] }).kind, 'denied');
  assert.equal(traceOutcome({ ok: true, commands: [{ name: 'trace', ok: true, value: 'oops' }] }).kind, 'error');
  assert.equal(traceOutcome({ authorized: false, label: 'Not authorized' }).kind, 'denied');
  assert.equal(traceOutcome({ ok: true, commands: [{ name: 'trace', ok: true, value: [] }] }).kind, 'empty');
  assert.equal(traceOutcome({ ok: true, commands: [{ name: 'trace', ok: true, value: [{ Subject: 'x' }] }] }).kind, 'rows');
});

test('the transport rule event names the rule, its ID and the action, and skips an empty DLP policy', () => {
  const r = parseRuleDetail(LIVE[1].Detail);
  assert.equal(r.ruleName, 'External Source labeled [EXTERNAL] in subject.');
  assert.equal(r.ruleId, '5C1D2E3F-0000-4000-8000-00000000E001');
  assert.equal(r.dlpPolicy, undefined);
  const e = explainEvent(LIVE[1]);
  assert.equal(e.action, 'Prepend subject');
  assert.equal(e.rule, 'External Source labeled [EXTERNAL] in subject.');
  const hits = rulesHit(LIVE);
  assert.equal(hits.length, 1);
  assert.deepEqual([hits[0].kind, hits[0].action, hits[0].id], ['Mail flow rule', 'Prepend subject', '5C1D2E3F-0000-4000-8000-00000000E001']);
  const dlp = parseRuleDetail("Transport rule: 'Block cards', ID: ('5C1D2E3F-0000-4000-8000-00000000E001'), DLP policy: 'PCI', ID: (aaaaaaaa-0000-4000-8000-0000000000a5).");
  assert.equal(dlp.dlpPolicy, 'PCI');
  assert.equal(parseRuleDetail(LIVE[0].Detail).receivedBy, 'CO1PR00MB0001.NAMP000.PROD.OUTLOOK.COM');
});

test('the event timeline shows time between hops and the total', () => {
  const tl = eventTimeline(LIVE);
  assert.deepEqual(tl.steps.map(s => s.gap), ['', '2 s', '1 s']);
  assert.equal(tl.total, '3 s');
  assert.equal(tl.slowest, null);
  const slow = eventTimeline([{ Date: '2026-11-19T22:00:00Z', Event: 'Receive' }, { Date: '2026-11-19T22:45:30Z', Event: 'Defer' }]);
  assert.equal(slow.slowest.gap, '45 min 30 s');
  assert.equal(formatUtc('2026-11-19T22:30:23Z'), '2026-11-19 22:30:23');
  assert.equal(formatUtc('2026-11-19T22:30:23'), '2026-11-19 22:30:23');
});

test('More information mirrors the portal flyout and adds the receiving server', () => {
  const row = { MessageId: '<a@b>', Size: 40211, FromIP: '209.85.0.1', ToIP: '', MessageTraceId: 'abc' };
  const facts = Object.fromEntries(messageFacts(row, LIVE));
  assert.equal(facts['Message ID'], '<a@b>');
  assert.match(facts['Message size'], /39\.3 KB \(40,211 bytes\)/);
  assert.match(facts.Direction, /^Inbound/);
  assert.equal(facts['Received by server'], 'CO1PR00MB0001.NAMP000.PROD.OUTLOOK.COM');
  assert.match(facts['Time inside Exchange Online'], /^3 s/);
  assert.match(directionOf({ FromIP: '', ToIP: '1.2.3.4' }), /^Outbound/);
  assert.match(directionOf({}), /^Internal/);
});

test('spam verdict fields are read from the detail when present', () => {
  assert.deepEqual(parseSpam('S:SFA=SUM|SFV=SPM|SCL=9|CTRY=US'), { scl: '9', sfv: 'SPM', cat: '', country: 'US' });
  assert.equal(parseSpam('The message was successfully delivered.'), null);
});

test('demo: subject search, status filter and related records by Message ID', () => {
  assert.equal(demoTrace({ subject: '[External]' }).commands[0].value.length, 2);
  assert.equal(demoTrace({ subject: 'shipping', subjectFilter: 'Contains', status: 'Failed' }).commands[0].value.length, 0);
  const rel = demoTrace({ recipient: 'adele.vance@contoso.com', messageId: '<clean-100@fabrikam.example>', related: true, messageTraceId: 'aaaaaaaa-0000-4000-8000-0000000000a2' });
  assert.equal(rel.commands[0].value.length, 2);
  assert.equal(rulesHit(rel.commands[1].value)[0].name, 'Flag external spoof');
});

test('the PowerShell trace mode sends UTC dates, trims input and returns UTC time stamps', () => {
  const ps = readFileSync(new URL('../server/Invoke-Ex360Command.ps1', import.meta.url), 'utf8');
  const block = ps.slice(ps.indexOf("$Mode -eq 'trace'"));
  assert.match(block, /\[DateTime\]::UtcNow/);
  assert.match(block, /\$out\.window/);
  assert.match(block, /\(\[string\]\$request\.sender\)\.Trim\(\)/);
  assert.match(block, /SubjectFilterType/);
  assert.match(block, /Get-MessageTraceDetailV2 -MessageTraceId \$traceId -RecipientAddress \$recipient/);
});

test('walkthrough: one plain line per step with the component that touched the message', async () => {
  const { traceWalkthroughSteps } = await import('../lib/trace.js');
  const { walkText, numberSteps } = await import('../lib/walkthrough.js');
  const row = { FromIP: '198.51.100.7', RecipientAddress: 'megan.bowen@contoso.com', Subject: '[EXTERNAL]LAB 1.0 baseline inbound' };
  const steps = traceWalkthroughSteps(row, LIVE);
  assert.deepEqual(steps.map(s => s.component), ['Exchange Online transport (CO1PR00MB0001)', 'Mail flow rules (transport rule agent)', 'Mailbox delivery']);
  assert.equal(steps[0].text, 'Received from 198.51.100.7 by Exchange Online server CO1PR00MB0001.');
  assert.equal(steps[1].text, 'Mail flow rule "External Source labeled [EXTERNAL] in subject." added "[EXTERNAL]" to the start of the subject.');
  assert.equal(steps[2].text, "Delivered to megan.bowen@contoso.com's mailbox.");
  assert.deepEqual(steps.map(s => s.gap), ['', '+2 s', '+1 s']);
  const text = walkText(steps).split('\n');
  assert.equal(text[0], 'Times are UTC.');
  assert.equal(text[2], '2. 22:30:25 (+2 s)  Mail flow rules (transport rule agent)  Mail flow rule "External Source labeled [EXTERNAL] in subject." added "[EXTERNAL]" to the start of the subject.');
  // Reusable by other tools: any { time, component, text } list.
  const hop = numberSteps([{ time: '2026-11-19T22:00:00Z', component: 'Firewall', text: 'Allowed.' }, { time: '2026-11-19T22:00:03Z', component: 'Router', text: 'Forwarded.' }]);
  assert.equal(hop[1].gap, '+3 s');
  assert.equal(hop[1].n, 2);
});

test('walkthrough covers failures, defers, quarantine and outbound sends', async () => {
  const { traceWalkthroughSteps, DEMO_TRACE, DEMO_TRACE_DETAIL } = await import('../lib/trace.js');
  const comps = DEMO_TRACE.slice(0, 4).map(r => traceWalkthroughSteps(r, DEMO_TRACE_DETAIL[r.MessageTraceId]).map(s => s.component));
  assert.ok(comps[0].includes('Exchange Online Protection spam filter') && comps[0].includes('Quarantine'));
  assert.ok(comps[2].includes('Data loss prevention'));
  assert.ok(comps[3].includes('Outbound transport'));
  const fail = traceWalkthroughSteps(DEMO_TRACE[2], DEMO_TRACE_DETAIL[DEMO_TRACE[2].MessageTraceId]);
  assert.match(fail.at(-1).text, /Delivery failed with 550 5\.7\.1/);
});
