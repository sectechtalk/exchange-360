import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from '../lib/analyzer.js';
import { HEADER_EXAMPLES, RULE_SCENARIOS, headerExample } from '../lib/learn-examples.js';
import { LEARN } from '../lib/content.js';
import { portalsFor } from '../lib/portals.js';

const source = readFileSync(new URL('../lib/learn-examples.js', import.meta.url), 'utf8');

test('Learn has 10 header examples and 5 transport rule scenarios with unique ids', () => {
  assert.equal(HEADER_EXAMPLES.length, 10);
  assert.equal(RULE_SCENARIOS.length, 5);
  assert.equal(new Set(HEADER_EXAMPLES.map(e => e.id)).size, 10);
  assert.equal(new Set(RULE_SCENARIOS.map(r => r.id)).size, 5);
  assert.equal(headerExample('bulk').id, 'bulk');
  assert.equal(headerExample('nope'), null);
});

for (const ex of HEADER_EXAMPLES) {
  test(`header example ${ex.id}: the analyzer reads what the explanation says`, () => {
    const a = analyze(ex.headers);
    const e = ex.expect;
    if ('spf' in e) assert.equal(a.summary.spf, e.spf);
    if ('dmarc' in e) assert.equal(a.summary.dmarc, e.dmarc);
    if ('compauth' in e) assert.equal(a.summary.compauth, e.compauth);
    if ('sfv' in e) assert.equal(a.summary.sfv, e.sfv);
    if ('cat' in e) assert.equal(a.summary.cat, e.cat);
    if ('bcl' in e) assert.equal(a.summary.bcl, e.bcl);
    if ('scl' in e) assert.equal(a.summary.scl, e.scl);
    if ('authAs' in e) assert.equal(a.organization.authAs, e.authAs);
    if ('arc' in e) assert.equal(a.authentication.arc.cv, e.arc);
    if ('rule' in e) assert.ok(a.organization.rules.includes(e.rule));
    if (e.slowHop) assert.ok(a.findings.some(f => f.title === 'A hop was slow'));
    if (e.noTls) assert.ok(a.findings.some(f => f.title === 'A hop did not advertise TLS'));
    assert.ok(a.hops.length >= 2, 'has a path to read');
    assert.doesNotMatch(a.plainLanguage.join('\n'), /disagree|does not match the/);
    assert.ok(ex.shows.length > 80 && ex.lookFor.length >= 2);
  });
}

test('a DMARC fail that compauth passed is a warning, not a block', () => {
  for (const id of ['dkim-fail-pnone', 'forwarded-arc']) {
    const a = analyze(headerExample(id).headers);
    assert.equal(a.summary.delivery, 'delivered, with an authentication or spam warning', id);
    assert.ok(!a.findings.some(f => f.severity === 'high'), id);
  }
  assert.equal(analyze(headerExample('dmarc-reject-spoof').headers).summary.delivery, 'likely junk, quarantine, or rejected');
});

test('internal mail with no SPF is not flagged as unaligned', () => {
  const a = analyze(headerExample('internal').headers);
  assert.ok(!a.findings.some(f => f.title === 'No aligned authentication'));
});

test('examples use only fictional names and documentation addresses', () => {
  assert.doesNotMatch(source, /sectechtalk|onmicrosoft\.com/i);
  for (const ip of source.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g)) {
    assert.match(ip, /^(203\.0\.113|198\.51\.100|10\.)|^255\.255\.255\.255$/, ip);
  }
  for (const d of source.match(/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org)\b/gi)) {
    assert.match(d, /(contoso\.com|outlook\.com|microsoft\.com)$/i, d);
  }
});

test('every transport rule scenario has conditions, actions and a Test-mode command', () => {
  for (const r of RULE_SCENARIOS) {
    assert.ok(r.situation && r.conditions.length && r.actions.length && r.exceptions.length, r.id);
    assert.match(r.powershell, /^New-TransportRule -Name "/);
    assert.match(r.powershell, /-Mode Audit$/);
  }
});

test('every Learn topic links to where its setting is configured', () => {
  for (const article of LEARN) {
    assert.ok(article.portals?.length, article.id);
    for (const id of article.portals) {
      const item = portalsFor(id);
      assert.ok(item, `${article.id}: portal ${id}`);
      for (const link of item.links) assert.match(link.url, /^https:\/\//);
    }
  }
});

test('the Learn page renders the examples and the analyzer opens one by id', () => {
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /headers: headerExamplesBox, rules: ruleScenariosBox/);
  assert.match(app, /Where this is configured/);
  assert.match(app, /#hops\?example=/);
  assert.match(app, /headerExample\(query\.example\)/);
});
