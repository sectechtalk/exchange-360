import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dlpForMailbox, retentionForMailbox, holdsForMailbox, caForMailbox } from '../lib/compliance.js';
import { DEMO_COMPLIANCE } from '../lib/demo-compliance.js';
import { DEMO_MAILBOXES } from '../lib/demo.js';
import { analyze } from '../lib/analyzer.js';
import { SAMPLE_DLP } from '../lib/samples.js';
import { NEW_DELEGATED } from '../lib/permissions.js';
import { PLAYBOOKS } from '../lib/content.js';

const megan = DEMO_MAILBOXES[0];

test('DLP scope names Exchange, test mode, and group membership', () => {
  const rows = dlpForMailbox(DEMO_COMPLIANCE.dlp, megan);
  const card = rows.find(r => r.name === 'Credit card in email');
  const sales = rows.find(r => r.name === 'Sales confidential');
  const spo = rows.find(r => r.name === 'SharePoint only');
  assert.equal(card.applies, true);
  assert.match(card.why, /does not block/);
  assert.equal(sales.applies, true);
  assert.match(sales.why, /group/);
  assert.equal(spo.applies, false);
  assert.match(spo.why, /does not include the Exchange workload/);
});

test('retention and holds say why this mailbox matches', () => {
  const kept = retentionForMailbox(DEMO_COMPLIANCE.retentionPolicies, megan);
  assert.equal(kept.find(r => r.name === 'Mailbox 7 years').applies, true);
  assert.equal(kept.find(r => r.name === 'Executives longer').applies, false);
  const holds = holdsForMailbox(DEMO_COMPLIANCE.cases, megan);
  assert.equal(holds[0].applies, true);
  assert.match(holds[0].why, /custodian/);
});

test('Conditional Access keeps SharePoint off the mailbox and Sales-only policies on Megan', () => {
  const rows = caForMailbox(DEMO_COMPLIANCE.ca, megan);
  assert.equal(rows.find(r => r.name === 'Require MFA for Exchange').applies, true);
  assert.equal(rows.find(r => r.name === 'Block legacy auth').applies, true);
  assert.equal(rows.find(r => r.name === 'SharePoint unmanaged devices').applies, false);
});

test('the hop analyzer explains a DLP header and a trace event', () => {
  const result = analyze(SAMPLE_DLP, { traceDetail: [{ event: 'DLP rule', detail: 'Credit card number' }, { event: 'Transport rule', detail: 'Disclaimer' }] });
  const text = result.plainLanguage.join(' ');
  assert.match(text, /DLP header is present/);
  assert.match(text, /test mode/);
  assert.match(text, /DLP event/);
  assert.match(text, /transport rule event/);
});

test('new playbooks stay read-only and named', () => {
  for (const title of ['DLP blocked or tipped my email', 'Is this mailbox on hold, and why']) {
    const book = PLAYBOOKS.find(item => item.title === title);
    assert.ok(book, title);
    assert.ok(book.steps.length >= 3);
    assert.match(book.powershell, /Get-/);
  }
});

test('job coverage maps the job areas and marks the other workloads not covered', () => {
  const doc = readFileSync(new URL('../docs/job-coverage.md', import.meta.url), 'utf8');
  for (const phrase of ['Mail flow and transport rules', 'Safe Links and Safe Attachments', 'SPF, DKIM and DMARC', 'Data Loss Prevention', 'Compliance portal administration', 'Resource mailboxes', 'Impersonation and spoofing protection', 'Monitor service health', 'Conditional Access', 'Exchange Online PowerShell']) {
    assert.match(doc, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  for (const name of ['Teams', 'SharePoint Online', 'OneDrive', 'Intune']) {
    assert.match(doc, new RegExp(`Preferred: ${name} \\| Not covered`));
  }
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  assert.match(readme, /docs\/job-coverage\.md/);
});

test('new delegated permissions are listed with the ids the docs publish', () => {
  const auth = readFileSync(new URL('../docs/auth.md', import.meta.url), 'utf8');
  assert.equal(NEW_DELEGATED.length, 6);
  for (const row of NEW_DELEGATED) {
    assert.match(auth, new RegExp(row.name));
    assert.match(auth, new RegExp(row.id));
  }
  assert.match(auth, /no delegated GUID is published/);
  assert.match(auth, /Connect-IPPSSession -AccessToken/);
});
