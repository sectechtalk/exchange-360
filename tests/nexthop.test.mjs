// NextHop: the prediction engine, the Contoso sample topology, the examples and the .mhtml report.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { predict, checkExport, orgOf, pickPolicy, containsWord, ipInRange, bytesOf, sitRefs, matchSits, lookalike, urlMatches, nextHopText, topologyRows, TOPOLOGY_AREAS, TOPOLOGY_PATHS, topologyStages } from '../lib/nexthop.js';
import { sampleExport, SECTION_META, SAMPLE_MAILBOX } from '../lib/nexthop-sample.js';
import { SCENARIOS } from '../lib/nexthop-scenarios.js';
import { nextHopHtml, nextHopMhtml, nextHopFileName, quotedPrintable } from '../lib/nexthop-report.js';
import { PAGES } from '../lib/pages.js';
import { PANE_PORTALS } from '../lib/pane-portals.js';
import { portalLinks } from '../lib/object-links.js';

const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const cfg = () => sampleExport();
const run = (id, change = {}) => predict(cfg(), { ...SCENARIOS.find(s => s.id === id).input, ...change });
const components = r => r.steps.map(s => s.component);

test('the sample has every section the export script writes, with the same command, group, direction and session', () => {
  const script = read('export/Export-MailFlowConfig.ps1');
  const names = [...script.matchAll(/@\{ name = '(\w+)'; conn = '(\w+)'; group = '(\w+)'; direction = '(\w+)'/g)].map(m => m.slice(1));
  assert.ok(names.length >= 67, `the script lists ${names.length} sections`);
  assert.deepEqual(Object.keys(SECTION_META).sort(), names.map(n => n[0]).sort());
  for (const [name, conn, group, direction] of names) {
    const [g, d, s] = SECTION_META[name];
    assert.deepEqual([g, d, s], [group, direction, conn], name);
  }
  const c = cfg();
  for (const [name, sec] of Object.entries(c.sections)) {
    assert.equal(sec.count, sec.items.length, name);
    assert.doesNotMatch(sec.command, /<mailbox/, `${name} names the mailbox`);
  }
});

test('the sample passes the export contract and checkExport', () => {
  const schema = JSON.parse(read('docs/contracts/mailflow-config.v1.schema.json'));
  const c = cfg();
  for (const key of schema.required) assert.ok(key in c, key);
  for (const [name, sec] of Object.entries(c.sections)) for (const key of schema.$defs.section.required) assert.ok(key in sec, `${name}.${key}`);
  assert.equal(c.format, schema.properties.format.const);
  assert.deepEqual(checkExport(c), { ok: true, message: '' });
  assert.equal(checkExport({ format: 'other' }).ok, false);
  assert.equal(checkExport({ ...c, version: 2 }).ok, false);
  assert.equal(c.sample, true);
  assert.equal(orgOf(c).mailbox.primary, SAMPLE_MAILBOX);
  // A fresh copy each time: changing one never changes the next.
  c.sections.transportRules.items.length = 0;
  assert.ok(cfg().sections.transportRules.items.length > 5);
});

test('the sample uses only reserved example names and documentation IPs', () => {
  const text = read('lib/nexthop-sample.js') + read('lib/nexthop-scenarios.js');
  for (const ip of text.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g)) assert.match(ip, /^(192\.0\.2|198\.51\.100|203\.0\.113)\./, ip);
  for (const domain of new Set(text.match(/@[a-z0-9.-]+\.[a-z]+/g).map(d => d.slice(1)))) assert.match(domain, /(\.example|contoso\.com|contoso\.onmicrosoft\.com|fabrikam\.com|northwindtraders\.com|contos0\.com)$/, domain);
  assert.doesNotMatch(text, /sectechtalk(?!\.mailflow-config)/i);
});

test('every example predicts the outcome it was written to show', () => {
  const expect = {
    'partner-invoice': /^Delivered to the Inbox$/,
    'partner-wrong-ip': /inbound connector \(550 5\.7\.51\)/,
    'ceo-fraud': /Quarantined by mail flow rule "Quarantine payment fraud phrases/,
    impersonation: /Quarantined as impersonation/,
    'exe-attachment': /blocked attachment type \.exe/,
    'blocked-ip': /connection filter/,
    'dmarc-reject': /DMARC with p=reject \(550 5\.7\.509\)/,
    'spam-sales': /Quarantined as spam/,
    'credit-card-out': /Blocked by DLP policy "U\.S\. Financial Data"/,
    'ssn-out': /only if the sender overrides/,
    'secure-to-fabrikam': /Sent to purchasing@fabrikam\.com \(encrypted\)/,
    'auto-forward': /550 5\.7\.520/,
    'big-attachment': /approval from the sender's manager, Alex Wilber/,
    'falcon-test': /^Sent to consultant@adatum\.example$/,
  };
  assert.deepEqual(SCENARIOS.map(s => s.id).sort(), Object.keys(expect).sort());
  for (const sc of SCENARIOS) {
    const r = predict(cfg(), sc.input);
    assert.match(r.outcome, expect[sc.id], `${sc.id}: ${r.outcome}`);
    assert.ok(r.steps.length >= 2, sc.id);
    r.steps.forEach((s, i) => { assert.equal(s.n, i + 1); assert.ok(['ok', 'info', 'medium', 'high'].includes(s.tone)); assert.ok(s.text.length > 10); });
    assert.deepEqual(r.unknowns, [], `${sc.id} has nothing it could not predict`);
  }
});

test('inbound runs in Exchange Online order and the partner invoice shows the classic mistakes', () => {
  const r = run('partner-invoice');
  const order = ['The Internet', 'Exchange Online front door', 'Inbound connector', 'Connection filter', 'Anti-malware', 'Mail flow rule', 'Data loss prevention', 'Anti-phishing', 'Anti-spam', 'Safe Attachments', 'Journaling', 'Retention and holds', 'Inbox rule', 'Forward to outside: blocked'];
  const at = order.map(c => components(r).indexOf(c));
  assert.ok(at.every(i => i >= 0), JSON.stringify(components(r)));
  assert.deepEqual([...at].sort((a, b) => a - b), at, 'steps are in order');
  const text = nextHopText(r);
  assert.match(text, /"Bypass spam filtering for Fabrikam".*spam confidence level to -1/);
  assert.match(text, /Spam filtering is skipped because of mail flow rule/);
  assert.match(text, /megan\.home@personalmail\.example.*550 5\.7\.520/s);
  assert.deepEqual(r.copies.map(c => c.to), ['journal@legalarchive.example']);
  const s = r.settings.find(x => x.property === 'SetSCL');
  assert.deepEqual([s.kind, s.name, s.value, s.section], ['transportRule', 'Bypass spam filtering for Fabrikam', '-1', 'transportRules']);
});

test('outbound: DLP, encryption, connectors and remote domains', () => {
  const cc = run('credit-card-out');
  assert.equal(cc.tone, 'high');
  assert.ok(cc.copies.some(c => c.to === 'compliance@contoso.com'));
  const fab = run('secure-to-fabrikam');
  assert.equal(fab.encrypted, true);
  assert.match(nextHopText(fab), /"To Fabrikam \(forced TLS\)".*certificate must name \*\.fabrikam\.com/);
  assert.match(nextHopText(fab), /Sales disclaimer on outside mail/);
  assert.match(nextHopText(fab), /remote domain "Fabrikam"/);
  // Auto-labeling applies Confidential to a credit card going inside an allowed path: test with DLP off.
  const c = cfg();
  c.sections.dlpPolicies.items = [];
  const lab = predict(c, SCENARIOS.find(s => s.id === 'credit-card-out').input);
  assert.match(nextHopText(lab), /Auto-labeling: "Label credit cards Confidential" labels the message "Confidential"/);
  // Legal routes through the rule-scoped connector.
  const legal = cfg();
  legal.sections.mailboxMemberOf.items.push({ DisplayName: 'Legal', Name: 'Legal', PrimarySmtpAddress: 'legal@contoso.com' });
  const routed = predict(legal, { direction: 'outbound', externalAddress: 'counsel@lawfirm.example', subject: 'Draft', body: 'See draft.' });
  assert.match(nextHopText(routed), /Sent through "Legal archive relay" because mail flow rule "Route Legal mail through the archive" routes it there/);
  assert.match(nextHopText(routed), /smart host relay\.legalarchive\.example/);
  // An automatic forward is allowed for Executives, then a remote domain can still drop it.
  const exec = cfg();
  exec.sections.mailboxMemberOf.items.push({ DisplayName: 'Executives', Name: 'Executives', PrimarySmtpAddress: 'executives@contoso.com' });
  const fwd = predict(exec, SCENARIOS.find(s => s.id === 'auto-forward').input);
  assert.match(fwd.outcome, /Dropped: remote domain "Personal mail services" blocks automatic forwards/);
  assert.match(nextHopText(fwd), /"Executives may forward" applies .*Automatic forwarding is On/);
});

test('policy precedence: Strict preset, then custom rules, then the default', () => {
  const c = cfg();
  const megan = { internal: true, address: SAMPLE_MAILBOX, addresses: [SAMPLE_MAILBOX], memberOf: orgOf(c).mailbox.memberOf };
  assert.equal(pickPolicy(c, { policies: 'antiSpamPolicies', rules: 'antiSpamRules', policyKey: 'HostedContentFilterPolicy', party: megan }).policy.Name, 'Sales anti-spam');
  const exec = { ...megan, memberOf: [...megan.memberOf, { name: 'Executives', keys: ['executives'] }] };
  const strict = pickPolicy(c, { policies: 'antiSpamPolicies', rules: 'antiSpamRules', policyKey: 'HostedContentFilterPolicy', party: exec });
  assert.equal(strict.preset, 'Strict');
  const nobody = { internal: true, address: 'x@contoso.com', addresses: ['x@contoso.com'], memberOf: [] };
  assert.equal(pickPolicy(c, { policies: 'antiSpamPolicies', rules: 'antiSpamRules', policyKey: 'HostedContentFilterPolicy', party: nobody }).policy.Name, 'Default');
  assert.equal(pickPolicy(c, { policies: 'safeLinksPolicies', rules: 'safeLinksRules', policyKey: 'SafeLinksPolicy', presetRules: 'presetAtpRules', builtIn: true, party: { ...nobody, addresses: ['x@other.example'] } }).builtIn, true);
  // Executives are excepted from the custom anti-phish rule.
  assert.notEqual(pickPolicy(c, { policies: 'antiPhishPolicies', rules: 'antiPhishRules', policyKey: 'AntiPhishPolicy', presetRules: null, party: exec }).policy.Name, 'Contoso impersonation protection');
});

test('test mode logs and never enforces', () => {
  const r = run('falcon-test');
  assert.ok(components(r).includes('Mail flow rule (test mode)'));
  assert.ok(components(r).includes('Data loss prevention (test mode)'));
  assert.equal(r.tone, 'ok');
});

test('a section the export could not read is reported, never silently treated as fine', () => {
  const c = cfg();
  c.sections.transportRules = { ...c.sections.transportRules, status: 'error', items: [], count: 0, error: { message: "The term 'Get-TransportRule' is not recognized" } };
  const r = predict(c, SCENARIOS[0].input);
  assert.ok(r.unknowns.some(u => /transportRules section is "error".*Get-TransportRule/.test(u)), r.unknowns.join('\n'));
});

test('a rule condition NextHop cannot judge is named, not guessed', () => {
  const c = cfg();
  c.sections.transportRules.items.unshift({ Name: 'Password-protected files', Priority: -1, State: 'Enabled', Mode: 'Enforce', AttachmentIsPasswordProtected: true, RejectMessageReasonText: 'No' });
  const r = predict(c, SCENARIOS[0].input);
  assert.ok(r.unknowns.some(u => /"Password-protected files" uses AttachmentIsPasswordProtected/.test(u)));
  assert.doesNotMatch(r.outcome, /Rejected/);
});

test('mailbox limits, delivery restrictions and inbound size', () => {
  const c = cfg();
  c.sections.mailbox.items[0].RequireSenderAuthenticationEnabled = true;
  assert.match(predict(c, SCENARIOS[0].input).outcome, /internal senders only \(550 5\.7\.133\)/);
  const big = predict(cfg(), { ...SCENARIOS[0].input, attachments: 'video.mp4 (40 MB)' });
  assert.match(big.outcome, /too large/);
  const fwd = cfg();
  fwd.sections.mailbox.items[0].ForwardingSmtpAddress = 'smtp:megan@fabrikam.com';
  const r = predict(fwd, { direction: 'inbound', externalAddress: 'a@outside.example', ip: '198.51.100.5', subject: 'hello', body: 'hi' });
  assert.match(nextHopText(r), /forwards all mail to megan@fabrikam\.com without keeping a copy/);
  assert.match(nextHopText(r), /automatic forwarding Automatic/);
});

test('helpers: words, IPs, sizes, sensitive information, look-alikes and URLs', () => {
  assert.ok(containsWord('Please send a Wire  Transfer today', 'wire transfer'));
  assert.ok(!containsWord('firewire transfers', 'wire transfer'));
  assert.ok(ipInRange('203.0.113.10', '203.0.113.0/26'));
  assert.ok(!ipInRange('203.0.113.70', '203.0.113.0/26'));
  assert.ok(ipInRange('198.51.100.5', '198.51.100.1-198.51.100.9'));
  assert.equal(bytesOf('36 MB (37,748,736 bytes)'), 37748736);
  assert.equal(bytesOf('Unlimited'), Infinity);
  assert.equal(bytesOf('10 MB'), 10485760);
  assert.deepEqual(sitRefs([{ name: 'Credit Card Number', mincount: '2' }]), [{ name: 'Credit Card Number', id: '', minCount: 2 }]);
  assert.equal(sitRefs('@{Name=U.S. Social Security Number (SSN); minCount=1}')[0].name, 'U.S. Social Security Number (SSN)');
  assert.equal(sitRefs([{ operator: 'And', groups: [{ name: 'Default', sensitivetypes: [{ name: 'Credit Card Number', mincount: 1 }] }] }])[0].name, 'Credit Card Number');
  const m = matchSits(sitRefs([{ name: 'Credit Card Number' }, { name: 'Made-up type' }]), 'card 4111-1111-1111-1111 and 4111 1111 1111 1112', null);
  assert.deepEqual(m.matched.map(x => [x.name, x.count]), [['Credit Card Number', 1]]);
  assert.deepEqual(m.unknown, ['Made-up type']);
  assert.ok(lookalike('contos0.com', 'contoso.com'));
  assert.ok(lookalike('fabrikarn.com', 'fabrikam.com'));
  assert.ok(!lookalike('adatum.example', 'contoso.com'));
  assert.ok(urlMatches('https://login.woodgrove.malicious.example/verify', '*.malicious.example/*'));
  assert.ok(!urlMatches('https://example.com/', '*.malicious.example/*'));
});

test('the .mhtml report holds the message, every step, the settings and opens as one HTML part', () => {
  const r = run('credit-card-out');
  const html = nextHopHtml(r, { generatedAt: '2026-11-22T08:00:00.000Z' });
  assert.match(html, /Sample topology/);
  assert.match(html, /Outcome:<\/strong> Blocked by DLP policy/);
  assert.equal((html.match(/<li class="/g) || []).length, r.steps.length);
  assert.match(html, /Block credit cards going outside/);
  assert.match(html, /purview\.microsoft\.com/);
  assert.doesNotMatch(html, /<script/i);
  const evil = predict(cfg(), { direction: 'inbound', externalAddress: 'x@outside.example', fromName: '<img src=x onerror=alert(1)>', subject: '<script>alert(1)</script>', body: '' });
  assert.doesNotMatch(nextHopHtml(evil), /<script>alert|<img src=x/);
  const mht = nextHopMhtml(r, { generatedAt: '2026-11-22T08:00:00.000Z', boundary: 'B' });
  assert.match(mht, /^From: <Saved by Exchange 360>\r\n/);
  assert.match(mht, /Content-Type: multipart\/related; type="text\/html"; boundary="B"/);
  assert.match(mht, /Content-Transfer-Encoding: quoted-printable/);
  assert.match(mht, /\r\n--B--\r\n$/);
  const body = mht.split('\r\n\r\n').slice(2).join('\r\n\r\n');
  for (const line of body.split('\r\n')) assert.ok(line.length <= 76, line);
  assert.equal(nextHopFileName(r, '2026-11-22T08:00:00Z'), 'Ex360-NextHop-outbound-orders-tailspintoys.example-2026-11-22-SAMPLE.mhtml');
  assert.equal(quotedPrintable('é = a '), '=C3=A9 =3D a=20');
});

test('NextHop is a TROUBLESHOOT page that works signed out, with portals and busy feedback on its buttons', () => {
  const page = PAGES.find(p => p.id === 'nexthop');
  assert.equal(page.section, 'Single recipient');
  assert.ok(PANE_PORTALS.nexthop);
  const app = read('public/app.js');
  assert.match(app, /SIGNED_OUT_VIEWS = new Set\(\[[^\]]*'nexthop'/);
  assert.match(app, /nexthop: \(\) => renderNextHop\(/);
  assert.match(read('public/index.html'), /data-view="nexthop"/);
  const src = read('public/nexthop-page.js');
  for (const label of ["'Opening…'", "'Reading the file…'", "'Predicting…'", "'Building…'", "'Starting…'", "flash(save, 'Downloaded')", "flash(copy, 'Copied')", "flash(again, 'Form above')", "flash(fresh, 'Blank form above')"]) assert.ok(src.includes(label), label);
  // Every button built on the page: busy(), flash() or an immediate redraw.
  assert.equal((src.match(/el\('button'/g) || []).length, 17, 'a new NextHop button needs busy(), flash() or a redraw; then update this count');
  // No demo mode: the sample opens only when chosen.
  assert.doesNotMatch(src, /state\.(demo|session)/);
  assert.match(src, /Sample topology: fictional Contoso, not your tenant/);
  for (const kind of ['journalRule', 'tenantAllowBlock', 'advancedDelivery', 'autoLabel']) assert.ok(portalLinks(kind, { name: 'x' }).links.length, kind);
});

test('topology rows cover every area', () => {
  const rows = topologyRows(cfg());
  assert.equal(rows.length, TOPOLOGY_AREAS.length);
  assert.ok(rows.every(r => r.status === 'ok' || r.status === 'empty'));
  // Every area the prediction reads is listed, and the ones it does not use yet say so.
  const keys = rows.map(r => r.key);
  for (const k of ['transportConfig', 'dkimSigningConfig', 'tenantAllowBlockIPs', 'tenantAllowBlockSpoof', 'secOpsOverridePolicy', 'phishSimOverridePolicy', 'presetEopRules', 'mailbox', 'mailboxStatistics', 'junkEmailConfig', 'autoReply', 'externalInOutlook']) assert.ok(keys.includes(k), k);
  assert.equal(rows.find(r => r.key === 'arcConfig').predicted, false);
  assert.equal(rows.find(r => r.key === 'transportRules').predicted, true);
  // Every area sits on the inbound or the outbound path (or both), once per path, and the paths hold nothing else.
  const all = TOPOLOGY_AREAS.map(([k]) => k).sort();
  for (const dir of ['inbound', 'outbound']) {
    const keys = TOPOLOGY_PATHS[dir].flatMap(st => st.keys);
    assert.equal(new Set(keys).size, keys.length, `${dir}: no area twice`);
    assert.ok(keys.every(k => all.includes(k)), dir);
    assert.equal(topologyStages(cfg(), dir).reduce((n, st) => n + st.rows.length, 0), keys.length);
  }
  assert.deepEqual([...new Set([...TOPOLOGY_PATHS.inbound, ...TOPOLOGY_PATHS.outbound].flatMap(st => st.keys))].sort(), all);
  assert.equal(TOPOLOGY_PATHS.outbound[0].id, 'mailbox');
});

test('NextHop panes fold under their heading, and settings sit under their step', () => {
  const src = read('public/nexthop-page.js');
  // Panes fold through the shared panel() in app.js, collapsed by default on every page.
  const app = read('public/app.js');
  assert.match(app, /const panel = \(\.\.\.kids\) => foldPane\(addPanePortal\(/);
  assert.match(app, /set\(!openPanes\(\)\[key\]\)/);
  assert.match(src, /stepSettings\(s\)/);
  assert.doesNotMatch(src, /el\('h3', \{ text: 'Settings that caused it' \}\)/);
});

test('the test message form stacks one field per row with (required) or (optional) beside each label', () => {
  const src = read('public/nexthop-page.js');
  const css = read('public/styles.css');
  assert.doesNotMatch(src.slice(src.indexOf('function messagePanel'), src.indexOf('// ---------------------------------------------------------------- Prediction')), /grid-3/);
  assert.match(src, /'\(required\)' : '\(optional\)'/);
  const rows = [...src.matchAll(/(?:field|select|fieldRow)\('(\w+)', '([^']+)', (true|false)/g)].map(m => [m[1], m[3]]);
  const want = { direction: 'true', mailbox: 'true', externalAddress: 'true', kind: 'true', auth: 'true', verdict: 'true', fromName: 'false', ip: 'false', bcl: 'false', malware: 'false', label: 'false', subject: 'false', attachments: 'false', body: 'false' };
  assert.deepEqual(Object.fromEntries(rows), want);
  assert.match(css, /\.form-rows\{display:grid;grid-template-columns:minmax\(14rem,max-content\) minmax\(0,36rem\)/);
  assert.match(css, /\.form-rows \.form-group\[hidden\]/);
});

test('every step links to the portal page where its setting is configured, DLP included', async () => {
  const { stepPortalKinds } = await import('../lib/nexthop.js');
  const engine = read('lib/nexthop.js');
  const components = [...new Set([...engine.matchAll(/add\('([A-Z][^']+)'/g)].map(m => m[1]))];
  const noPortal = new Set(['The Internet', 'NextHop', 'Outlook']);
  for (const component of components) {
    if (noPortal.has(component)) continue;
    const kinds = stepPortalKinds({ component, settings: [] });
    assert.ok(kinds.length, `no portal for step "${component}"`);
    for (const kind of kinds) {
      const { links, note } = portalLinks(kind, { name: '' });
      assert.ok(links.length || note, `${component}: ${kind} has neither a link nor a PowerShell note`);
    }
  }
  assert.deepEqual(stepPortalKinds({ component: 'Data loss prevention', settings: [] }), ['dlp']);
  assert.match(portalLinks('dlp').links[0].url, /^https:\/\/purview\.microsoft\.com\/datalossprevention\/policies$/);
  // A preset policy is changed on the preset page first.
  assert.deepEqual(stepPortalKinds({ component: 'Anti-spam', settings: [{ kind: 'antiSpam', name: 'Standard Preset Security Policy1791167387231' }] }), ['presetPolicy', 'antiSpam']);
  // The real prediction for an inbound message gives every step after the Internet at least one link.
  const result = predict(cfg(), { direction: 'inbound', externalAddress: 'a@outside.example', ip: '198.51.100.20', auth: 'pass', verdict: 'clean' });
  for (const step of result.steps.filter(x => !noPortal.has(x.component))) assert.ok(stepPortalKinds(step).length, step.component);
  const page = read('public/nexthop-page.js');
  assert.match(page, /stepLinks\(s\)/);
  assert.match(page, /'Some settings shown in'/);
});

test('the step-by-step list is striped like the tables', () => {
  const css = read('public/styles.css');
  assert.match(css, /\.walk > \.walk-step:nth-child\(odd\)\{background:var\(--row-a\)\}/);
  assert.match(css, /\.walk > \.walk-step:nth-child\(even\)\{background:var\(--row-b\)\}/);
});

test('another check can start straight away, and a refresh keeps the configuration and form', () => {
  const page = read('public/nexthop-page.js');
  assert.match(page, /text: 'Change this check'/);
  assert.match(page, /text: 'New check'/);
  assert.match(page, /indexedDB\.open\(STORE\.db, 1\)/);
  assert.match(page, /await restoreState\(\)/);
  // Every storage call is guarded, so a private window still works.
  assert.match(page, /catch \{ \/\* private window or storage blocked/);
});

test('live read: runs the export with the session tokens, in the background, with a bubble only past 10 seconds', async () => {
  const { startLive, liveStatus, forgetLive } = await import('../server/nexthop-live.mjs');
  let finish;
  let seen;
  const run = opts => { seen = opts; return new Promise(resolve => { finish = resolve; }); };
  const times = ['2026-11-23T05:00:00.000Z', '2026-11-23T05:01:30.000Z'];
  const now = () => times.shift() || '2026-11-23T05:02:00.000Z';
  assert.equal(startLive('s1', { exoToken: '', upn: 'a@b.com', run }).state, 'error');
  const first = startLive('s1', { exoToken: 'exo', ippsToken: 'ipps', upn: 'megan.bowen@contoso.com', mailbox: '', total: 67, run, now });
  assert.equal(first.state, 'running');
  assert.equal(first.mailbox, 'megan.bowen@contoso.com');
  await new Promise(r => setImmediate(r));
  assert.deepEqual([seen.exoToken, seen.ippsToken, seen.upn], ['exo', 'ipps', 'megan.bowen@contoso.com']);
  seen.onLine('  OK           acceptedDomains            3 item(s)');
  seen.onLine('  EMPTY        journalRules               ran, nothing configured');
  assert.equal(liveStatus('s1').sections, 2);
  assert.equal(startLive('s1', { exoToken: 'exo', upn: 'megan.bowen@contoso.com', run }).state, 'running', 'a second start joins the running read');
  finish({ code: 0, config: { summary: { sections: 2, ok: 1, empty: 1 }, sections: {} } });
  await new Promise(r => setImmediate(r));
  assert.equal(liveStatus('s1').state, 'done');
  assert.equal(liveStatus('s1').config, undefined, 'the configuration is sent only when asked for');
  assert.ok(liveStatus('s1', { withConfig: true }).config);
  assert.doesNotMatch(JSON.stringify(liveStatus('s1', { withConfig: true })), /"exo"|ipps/);
  forgetLive('s1');
  assert.equal(liveStatus('s1').state, 'none');
  const fail = startLive('s2', { exoToken: 'exo', upn: 'x@y.com', run: async () => { throw new Error('Connect-ExchangeOnline failed'); } });
  assert.equal(fail.state, 'running');
  await new Promise(r => setImmediate(r));
  assert.equal(liveStatus('s2').state, 'error');
  assert.match(liveStatus('s2').message, /Connect-ExchangeOnline failed/);

  const server = read('server/nexthop-live.mjs');
  assert.match(server, /writeFileSync\(exoPath, exoToken, \{ mode: 0o600 \}\)/);
  assert.doesNotMatch(server, /'-AccessToken'/, 'tokens go in files, never on the command line');
  const wrapper = read('server/Invoke-Ex360NextHop.ps1');
  assert.match(wrapper, /UseExistingConnection = \$true/);
  assert.match(wrapper, /ConnectCompliance = \{ Connect-IPPSSession -AccessToken \$ippsToken/);
  const exportScript = read('export/Export-MailFlowConfig.ps1');
  assert.match(exportScript, /\[Parameter\(\)\]\[scriptblock\]\$ConnectCompliance/);
  assert.match(read('Dockerfile'), /^COPY export \.\/export$/m);
  const page = read('public/nexthop-page.js');
  assert.match(page, /const QUICK_MS = 10000;/);
  assert.match(page, /if \(!live\.startedHere \|\| !\(took >= QUICK_MS\)\) return;/);
  assert.match(page, /Notification\.requestPermission\(\)/);
  assert.match(read('server/index.mjs'), /url\.pathname === '\/api\/nexthop\/live'/);
});
