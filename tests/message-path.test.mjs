// Message path (lib/message-path.js) and filling a NextHop test message from a real message (lib/message-input.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { predict } from '../lib/nexthop.js';
import { sampleExport } from '../lib/nexthop-sample.js';
import { SCENARIOS } from '../lib/nexthop-scenarios.js';
import { SAMPLES } from '../lib/samples.js';
import { pathModel, pathOverlay, pathText, stopOf, ruleDirections, INBOUND_STOPS, OUTBOUND_STOPS, lanesModel, lanesOverlay, lanesText, INBOUND_LANES, OUTBOUND_LANES } from '../lib/message-path.js';
import { inputFromMessage, parseAddressList, decodeWords, readMime } from '../lib/message-input.js';

const cfg = () => sampleExport();
const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('the model puts every configured object under a step, rules in priority order', () => {
  const m = pathModel(cfg());
  assert.equal(m.inbound.length, INBOUND_STOPS.length);
  assert.equal(m.outbound.length, OUTBOUND_STOPS.length);
  const names = rail => rail.flatMap(s => s.objects.map(o => o.name));
  for (const n of ['contoso.com', 'Fabrikam partner (TLS, IP-restricted)', 'Default', 'Bypass spam filtering for Fabrikam', 'U.S. Financial Data', 'Contoso Safe Attachments', 'megan.bowen@contoso.com']) assert.ok(names(m.inbound).includes(n), n);
  for (const n of ['To Fabrikam (forced TLS)', 'Personal mail services', 'Sales disclaimer on outside mail', 'Executives may forward']) assert.ok(names(m.outbound).includes(n), n);
  const rules = m.inbound[4].objects.filter(o => o.kind === 'transportRule').map(o => o.priority);
  assert.deepEqual(rules, [...rules].sort((a, b) => a - b));
  // Scope decides the side: an outside-only rule is not on the outbound path, an outbound-only one not inbound.
  assert.ok(!m.outbound[2].objects.some(o => o.name === 'External email warning'));
  assert.ok(!m.inbound[4].objects.some(o => o.name === 'Sales disclaimer on outside mail'));
  assert.deepEqual(ruleDirections({}), { inbound: true, outbound: true });
  // Disabled and test-mode objects are marked, not hidden.
  assert.equal(m.outbound[2].objects.find(o => o.name === 'Old marketing redirect (retired)').on, false);
  assert.equal(m.outbound[2].objects.find(o => o.name === 'Project Falcon must not leave (test)').test, true);
});

test('every NextHop component maps to a step', () => {
  const src = read('lib/nexthop.js');
  const components = [...new Set([...src.matchAll(/add\('([^']+)'/g)].map(m => m[1]))].filter(c => c !== 'NextHop' && c !== 'presetPolicy');
  for (const c of components) {
    assert.ok(stopOf('inbound', c, -1) >= 0 || stopOf('outbound', c, -1) >= 0, `component "${c}" has no step`);
  }
});

test('every example lights the objects that acted, on the right side, and says where it stopped', () => {
  const c = cfg();
  const m = pathModel(c);
  for (const sc of SCENARIOS) {
    const r = predict(c, sc.input);
    const o = pathOverlay(m, r);
    assert.equal(o.direction, r.direction, sc.id);
    const stopped = o.stops.filter(s => s.state === 'stopped');
    const reached = o.stops.filter(s => s.state === 'reached');
    assert.equal(stopped.length + reached.length, 1, `${sc.id}: exactly one final step`);
    // Nothing that acted is lost: it is lit on the rail or listed as used elsewhere.
    for (const step of r.steps) for (const x of [...(step.objects || []), ...(step.settings || [])]) {
      if (!x?.kind || !x.name || x.kind === 'transportConfig') continue;
      const key = `${x.kind}:${String(x.kind === 'dlp' ? x.name.split(' > ')[0] : x.name).toLowerCase()}`;
      assert.ok(o.hits.has(key), `${sc.id}: ${key}`);
    }
    assert.match(pathText(m, o), /STOPPED HERE|reached/, sc.id);
  }
});

test('blocked messages stop at the step that blocked them', () => {
  const c = cfg(); const m = pathModel(c);
  const stopAt = id => { const o = pathOverlay(m, predict(c, SCENARIOS.find(s => s.id === id).input)); return o.stops.findIndex(s => s.state === 'stopped'); };
  assert.equal(stopAt('partner-wrong-ip'), 2);
  assert.equal(stopAt('exe-attachment'), 3);
  assert.equal(stopAt('ceo-fraud'), 4);
  assert.equal(stopAt('spam-sales'), 5);
  assert.equal(stopAt('credit-card-out'), 2);
  assert.equal(stopAt('auto-forward'), 1);
  const o = pathOverlay(m, predict(c, SCENARIOS.find(s => s.id === 'ceo-fraud').input));
  assert.equal(o.stops[6].state, 'not-reached');
  assert.equal(o.hits.get('transportRule:quarantine payment fraud phrases from outside').tone, 'high');
});

test('a delivered message reaches the last step', () => {
  const c = cfg(); const m = pathModel(c);
  const o = pathOverlay(m, predict(c, SCENARIOS.find(s => s.id === 'secure-to-fabrikam').input));
  assert.equal(o.stops.at(-1).state, 'reached');
  assert.ok(o.hits.has('connector:to fabrikam (forced tls)'));
  assert.ok(o.stops.slice(0, -1).every(s => s.state === 'passed'));
});

test('headers fill the test message and say where each value came from', () => {
  const c = cfg();
  const spoof = inputFromMessage(SAMPLES.spoof.headers, c);
  assert.equal(spoof.input.direction, 'inbound');
  assert.equal(spoof.input.externalAddress, 'payroll@contoso.com');
  assert.equal(spoof.input.ip, '203.0.113.45');
  assert.equal(spoof.input.auth, 'dmarc-none');
  assert.equal(spoof.input.verdict, 'spam');
  assert.equal(spoof.input.bcl, '6');
  assert.ok(spoof.read.find(r => r.field === 'Sending IP').from.includes('CIP'));
  assert.deepEqual(spoof.rulesInHeaders, ['Flag external spoof']);
  // The prediction runs on what was filled.
  assert.ok(predict(c, spoof.input).steps.length > 3);
  const clean = inputFromMessage(SAMPLES.clean.headers, c);
  assert.ok(clean.notes.some(n => /holds one mailbox, megan\.bowen@contoso\.com/.test(n)), 'a different recipient is called out');
});

test('DMARC action, composite failure, verdicts and direction are read from Microsoft stamps', () => {
  const c = cfg();
  const h = extra => `From: Bank <alerts@bank.example>\nTo: megan.bowen@contoso.com\nSubject: Hi\n${extra}\n`;
  assert.equal(inputFromMessage(h('Authentication-Results: spf=fail smtp.mailfrom=bank.example; dmarc=fail action=oreject header.from=bank.example; compauth=fail reason=000'), c).input.auth, 'dmarc-reject');
  assert.equal(inputFromMessage(h('Authentication-Results: dmarc=fail action=quarantine header.from=bank.example'), c).input.auth, 'dmarc-quarantine');
  assert.equal(inputFromMessage(h('Authentication-Results: spf=none; dmarc=none action=none header.from=bank.example; compauth=fail reason=001'), c).input.auth, 'composite-fail');
  assert.equal(inputFromMessage(h('X-Forefront-Antispam-Report: CIP:198.51.100.7;SFV:SPM;CAT:HPHSH;DIR:INB;'), c).input.verdict, 'hcphish');
  const skipped = inputFromMessage(h('X-Forefront-Antispam-Report: SFV:SKN;CAT:NONE;'), c);
  assert.ok(skipped.notes.some(n => /SFV:SKN/.test(n)));
  const out = inputFromMessage('From: Megan Bowen <megan.bowen@contoso.com>\nTo: Pat <pat@customer.example>, Alex <alex.wilber@contoso.com>\nSubject: Quote\n', c);
  assert.equal(out.input.direction, 'outbound');
  assert.equal(out.input.externalAddress, 'pat@customer.example');
  assert.equal(inputFromMessage(h('Auto-Submitted: auto-replied'), c).input.kind, 'autoreply');
  // The oldest outside Received hop gives the IP when there is no CIP.
  const hop = inputFromMessage(h('Received: from relay.bank.example ([198.51.100.99]) by x.mail.protection.outlook.com with ESMTPS; Wed, 25 Nov 2026 10:00:00 +0000'), c);
  assert.equal(hop.input.ip, '198.51.100.99');
  assert.throws(() => inputFromMessage('just some text', c), /No message headers/);
});

test('a whole .eml gives the body and attachments', () => {
  const eml = [
    'From: "Fabrikam Billing" <billing@fabrikam.com>', 'To: megan.bowen@contoso.com', 'Subject: =?utf-8?B?SW52b2ljZSA0NDcx?=',
    'MIME-Version: 1.0', 'Content-Type: multipart/mixed; boundary="b1"', '',
    '--b1', 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: quoted-printable', '', 'Please pay by wire transfer=2E', '',
    '--b1', 'Content-Type: application/octet-stream; name="setup.exe"', 'Content-Disposition: attachment; filename="setup.exe"', 'Content-Transfer-Encoding: base64', '', 'A'.repeat(4000), '',
    '--b1--', ''].join('\r\n');
  const r = inputFromMessage(eml, cfg());
  assert.equal(r.input.subject, 'Invoice 4471');
  assert.equal(r.input.body, 'Please pay by wire transfer.');
  assert.match(r.input.attachments, /^setup\.exe \(3 KB\)$/);
  assert.equal(predict(cfg(), r.input).outcome.startsWith('Rejected'), true, 'the .exe is caught');
  assert.deepEqual(parseAddressList('"Doe, Jane" <jane@x.example>, bob@y.example').map(a => a.address), ['jane@x.example', 'bob@y.example']);
  assert.equal(decodeWords('=?utf-8?Q?Caf=C3=A9_menu?='), 'Café menu');
  assert.equal(readMime('Content-Type: text/html', '<p>Hi&nbsp;<b>there</b></p>').html, 'Hi there');
});

test('the NextHop page draws the path and fills from a message with busy feedback', () => {
  const page = read('public/nexthop-page.js');
  for (const label of ["'Reading the message…'", "'Reading the file…'", "flash(choose, 'Choose a file')", 'messagePathPanel(', 'inputFromMessage(']) assert.ok(page.includes(label), label);
  const view = read('public/message-path-view.js');
  for (const label of ["'Drawing…'", "flash(copy, 'Copied')", 'openDetails(', 'portalBlock(', "'Mail flow lanes'", 'lanesOverlay(']) assert.ok(view.includes(label), label);
  assert.equal((view.match(/el\('button'/g) || []).length, 6, 'a new Message path button needs busy(), flash() or a redraw; then update this count');
  // Message path is hidden (2026-11-26): Mail flow lanes opens first and carries each step's state.
  assert.match(view, /const SHOW_MESSAGE_PATH = false;/);
  assert.match(view, /mode: SHOW_MESSAGE_PATH \? 'path' : 'lanes'/);
  assert.match(view, /el\('span', \{ class: `mp-state \$\{s\.state\}`, text: STATE_WORD\[s\.state\] \}\)/);
});

test('Mail flow lanes: one column per place, in processing order, every object once per direction', () => {
  const c = cfg();
  const lm = lanesModel(c);
  const m = pathModel(c);
  for (const [dir, defs] of [['inbound', INBOUND_LANES], ['outbound', OUTBOUND_LANES]]) {
    assert.equal(lm[dir].length, defs.length);
    const keys = lm[dir].flatMap(l => l.objects.map(o => o.key));
    assert.equal(new Set(keys).size, keys.length, `${dir}: no object twice`);
    for (const o of m[dir].flatMap(s => s.objects)) assert.ok(keys.includes(o.key), `${dir}: ${o.key}`);
    const stops = defs.map(d => d.stop);
    assert.deepEqual(stops, [...stops].sort((a, b) => a - b), `${dir}: columns follow the rail order`);
    const prios = lm[dir].find(l => l.id === 'rules').objects.map(o => o.priority);
    assert.deepEqual(prios, [...prios].sort((a, b) => a - b));
    assert.ok(lm[dir].find(l => l.id === 'rules').objects.every(o => o.kind === 'transportRule'));
  }
  // Inbound: malware before the rules, phishing and spam after them; outbound runs from the mailbox to the outside.
  const ids = lm.inbound.map(l => l.id);
  assert.ok(ids.indexOf('malware') < ids.indexOf('rules') && ids.indexOf('rules') < ids.indexOf('spam'));
  assert.ok(lm.inbound.find(l => l.id === 'spam').objects.some(o => o.kind === 'quarantinePolicy'));
  assert.equal(lm.outbound[0].id, 'sender');
  assert.equal(lm.outbound.at(-1).id, 'destination');
});

test('Mail flow lanes tracks a message exactly like the Message path', () => {
  const c = cfg();
  const lm = lanesModel(c);
  const m = pathModel(c);
  for (const sc of SCENARIOS) {
    const r = predict(c, sc.input);
    const lo = lanesOverlay(lm, r);
    const po = pathOverlay(m, r);
    assert.deepEqual([...lo.hits.keys()].sort(), [...po.hits.keys()].sort(), `${sc.id}: same objects lit`);
    for (const [k, h] of po.hits) assert.equal(lo.hits.get(k).tone, h.tone, `${sc.id}: ${k} same tone`);
    assert.equal(lo.outcome, r.outcome);
    // The route visits lit objects in step order.
    const firsts = lo.route.map(x => x.first);
    assert.deepEqual(firsts, [...firsts].sort((a, b) => a - b), sc.id);
    // Columns are in processing order, so the route only moves right.
    const cols = lo.route.map(x => x.lane);
    assert.deepEqual(cols, [...cols].sort((a, b) => a - b), `${sc.id}: route moves left to right`);
    assert.ok(lanesText(lm, lo).startsWith('Mail flow lanes'), sc.id);
  }
  const fraud = lanesOverlay(lm, predict(c, SCENARIOS.find(s => s.id === 'ceo-fraud').input));
  assert.equal(fraud.route.at(-1).name, 'Quarantine payment fraud phrases from outside');
});
