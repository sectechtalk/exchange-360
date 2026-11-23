import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, explainCompauth, hopSummary, isImpersonationVerdict } from '../lib/analyzer.js';
import { SAMPLES } from '../lib/samples.js';

const text = analysis => analysis.plainLanguage.join('\n');
const headers = body => analyze(`Authentication-Results: ${body}\n`);

test('the spoof sample does not claim a quarantine or reject policy when action=none', () => {
  const lines = text(analyze(SAMPLES.spoof.headers));
  assert.match(lines, /DMARC fail action=none/);
  assert.match(lines, /action recorded here is none, not quarantine or reject/);
  assert.match(lines, /reason code and the action stamp disagree/);
  assert.doesNotMatch(lines, /the DMARC policy is p=quarantine or p=reject(?!.*action=none)/s);
  assert.match(lines, /1 of them is an Exchange Online Protection hop/);
  assert.match(lines, /3 of them are Exchange Online hops/);
  assert.doesNotMatch(lines, /1 of them are/);
  assert.match(lines, /SFTY 9\.19 is a domain impersonation verdict/);
});

test('spoofing without an impersonation stamp does not claim impersonation', () => {
  const analysis = analyze('X-Forefront-Antispam-Report: CAT:SPOOF;SFV:SPM;DIR:INB\n');
  const lines = text(analysis);
  assert.match(lines, /not an impersonation verdict/);
  assert.doesNotMatch(lines, /is a domain impersonation verdict|is a user impersonation verdict/);
  assert.equal(isImpersonationVerdict('SPOOF', ''), false);
  assert.equal(isImpersonationVerdict('DIMP', ''), true);
  assert.equal(isImpersonationVerdict('', '9.19'), true);
  assert.equal(isImpersonationVerdict('', '9.25'), false);
});

test('reason 000 agrees when the DMARC action is reject', () => {
  const line = explainCompauth({ result: 'fail', reason: '000' }, { dmarc: { action: 'oreject' } });
  assert.match(line, /action=oreject/);
  assert.match(line, /matches that documented policy/);
  assert.doesNotMatch(line, /disagree/);
});

test('reason 000 says the p= value cannot be read when no action is stamped', () => {
  const line = explainCompauth({ result: 'fail', reason: '000' }, {});
  assert.match(line, /does not stamp a DMARC action/);
  assert.match(line, /cannot be read from the message/);
});

test('reason 001 agrees with action=none and disagrees with reject', () => {
  const agreed = explainCompauth({ result: 'fail', reason: '001' }, { dmarc: { action: 'none' } });
  assert.match(agreed, /agrees with a policy that is not being enforced/);
  const disagreed = explainCompauth({ result: 'fail', reason: '001' }, { dmarc: { action: 'pct.reject' } });
  assert.match(disagreed, /disagree/);
  assert.match(disagreed, /pct\.reject/);
});

test('reason 002 does not invent a DMARC policy', () => {
  const line = explainCompauth({ result: 'fail', reason: '002' }, { dmarc: { action: 'none' } });
  assert.match(line, /prohibited this sender or domain/);
  assert.doesNotMatch(line, /p=quarantine|p=reject|action=none/);
});

test('reason 010 follows the stamped action', () => {
  const none = explainCompauth({ result: 'fail', reason: '010' }, { dmarc: { action: 'none' } });
  assert.match(none, /intra-org spoof/);
  assert.match(none, /disagree/);
  const quarantine = explainCompauth({ result: 'fail', reason: '010' }, { dmarc: { action: 'pct.quarantine' } });
  assert.match(quarantine, /matches that documented policy/);
});

test('1xx reasons describe a pass and notice a mismatched result', () => {
  for (const code of ['100', '101', '102', '103', '104', '108', '109', '111', '112', '115', '116', '130']) {
    const line = explainCompauth({ result: 'pass', reason: code }, {});
    assert.match(line, new RegExp(`reason=${code}`));
    assert.doesNotMatch(line, /does not match/);
  }
  const wrong = explainCompauth({ result: 'fail', reason: '100' }, {});
  assert.match(wrong, /does not match the pass result/);
});

test('reason 130 disagrees with an ARC chain that failed', () => {
  const line = explainCompauth({ result: 'pass', reason: '130' }, { arc: { cv: 'fail' } });
  assert.match(line, /ARC cv=fail/);
  assert.match(line, /disagree/);
});

test('2xx reasons are a soft pass', () => {
  for (const code of ['201', '202']) {
    const line = explainCompauth({ result: 'softpass', reason: code }, {});
    assert.match(line, /[Ss]oft pass/);
    assert.doesNotMatch(line, /does not match/);
  }
  const band = explainCompauth({ result: 'softpass', reason: '299' }, {});
  assert.match(band, /2xx reason means composite authentication soft-passed/);
});

test('4xx and 9xx reasons are a bypass, and 6xx is an implicit failure', () => {
  const bypassed = explainCompauth({ result: 'none', reason: '401' }, {});
  assert.match(bypassed, /4xx reason means composite authentication was bypassed/);
  const complex = explainCompauth({ result: 'none', reason: '905' }, { dmarc: { action: 'none' } });
  assert.match(complex, /complex routing/);
  assert.match(complex, /agrees with a policy that is not being enforced/);
  const intra = explainCompauth({ result: 'fail', reason: '601' }, {});
  assert.match(intra, /accepted domain/);
  assert.match(intra, /compauth=fail/);
  const band = explainCompauth({ result: 'fail', reason: '650' }, {});
  assert.match(band, /6xx reason means implicit authentication failed/);
});

test('hop counts use is for one and are for the rest', () => {
  assert.equal(hopSummary([]), 'No Received lines were found, so there is no hop list.');
  assert.match(hopSummary([{ kind: 'eop' }]), /crossed 1 hop\. 1 of them is an Exchange Online Protection hop and 0 of them are Exchange Online hops/);
  assert.match(hopSummary([{ kind: 'eop' }, { kind: 'exo' }, { kind: 'exo' }]), /3 hops\. 1 of them is an Exchange Online Protection hop and 2 of them are Exchange Online hops/);
});

test('the clean sample stays consistent', () => {
  const lines = text(analyze(SAMPLES.clean.headers));
  assert.match(lines, /DMARC pass action=none/);
  assert.match(lines, /reason=100/);
  assert.match(lines, /compauth=pass/);
  assert.doesNotMatch(lines, /disagree/);
  assert.doesNotMatch(lines, /impersonation verdict/);
});

test('a one-seal ARC line does not say seal(s)', () => {
  const lines = text(headers('compauth=pass reason=100\nARC-Seal: i=1; cv=pass; d=microsoft.com'));
  assert.match(lines, /1 seal\./);
  assert.doesNotMatch(lines, /seal\(s\)/);
});
