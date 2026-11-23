// Delegation page: the mailbox read survives awkward Exchange objects, failed reads are shown as failed,
// and commands carry the chosen mailbox's address instead of <user>.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fillUser, portalsFor } from '../lib/portals.js';
import { buildMailboxReport } from '../lib/report.js';
import { demoReportInput } from '../lib/demo-report.js';
import { mailboxFromReads } from '../server/live.mjs';

const root = path.resolve(import.meta.dirname, '..');
const pwsh = process.env.EX360_PWSH || 'pwsh';
const hasPwsh = spawnSync(pwsh, ['-NoProfile', '-Command', '1'], { encoding: 'utf8' }).status === 0;

function runMode(mode, args = {}, script = path.join(root, 'server', 'Invoke-Ex360Command.ps1')) {
  const dir = mkdtempSync(path.join(tmpdir(), 'ex360-test-'));
  try {
    writeFileSync(path.join(dir, 'token'), 'fake-token');
    writeFileSync(path.join(dir, 'args.json'), JSON.stringify(args));
    const res = spawnSync(pwsh, ['-NoProfile', '-NonInteractive', '-File', script, '-TokenPath', path.join(dir, 'token'), '-Organization', 'contoso.onmicrosoft.com', '-UserPrincipalName', 'alex@contoso.com', '-Mode', mode, '-ArgsPath', path.join(dir, 'args.json')], {
      encoding: 'utf8',
      env: { ...process.env, PSModulePath: path.join(root, 'tests', 'fixtures', 'fake-exo') },
    });
    return JSON.parse(res.stdout);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('fillUser puts the chosen address into every <user>', () => {
  const cmd = portalsFor('delegation').powershell;
  assert.match(cmd, /<user>/);
  const filled = fillUser(cmd, 'megan.bowen@contoso.com');
  assert.doesNotMatch(filled, /<user>/);
  assert.equal(filled.split('megan.bowen@contoso.com').length - 1, 3);
  assert.equal(fillUser(cmd, ''), cmd, 'no mailbox open keeps the placeholder');
  assert.equal(fillUser('Get-Mailbox -Identity <user>', "Bob O'Neil"), "Get-Mailbox -Identity 'Bob O''Neil'");
});

test('the mailbox report fills its commands with the report subject', () => {
  const report = buildMailboxReport(demoReportInput());
  const commands = report.sections.flatMap(s => s.portals.map(p => p.powershell));
  assert.ok(commands.length);
  assert.ok(commands.every(c => !c.includes('<user>')));
  assert.ok(commands.some(c => c.includes(report.subject.address)));
});

test('a failed Exchange read is reported as failed in every delegation section, not as empty', () => {
  const exo = { ok: false, message: "The type 'System.Collections.Hashtable' is not supported for serialization" };
  const mailbox = mailboxFromReads({ id: '9454e54f', displayName: 'Alex', mail: 'alex@contoso.com' }, { ok: true, value: [] }, exo);
  for (const err of [mailbox.fullError, mailbox.sendAsError, mailbox.sendOnBehalfError, mailbox.granted.fullAccessError, mailbox.granted.sendAsError, mailbox.granted.sendOnBehalfError]) {
    assert.equal(err.ok, false);
    assert.match(err.message, /failed: The type/);
  }
  assert.equal(mailbox.primary, 'alex@contoso.com');
});

test('mailbox mode serializes a mailbox that carries a dictionary with non-string keys', { skip: !hasPwsh && 'pwsh not installed' }, () => {
  const out = runMode('mailbox', { identity: 'alex@contoso.com' });
  assert.equal(out.ok, true, JSON.stringify(out));
  const byName = Object.fromEntries(out.commands.map(c => [c.name, c]));
  for (const name of ['mailbox', 'stats', 'cas', 'full', 'sendas', 'grantedFull', 'grantedSendAs', 'grantedSendOnBehalf']) assert.equal(byName[name].ok, true, name);

  const mailbox = mailboxFromReads({ id: '1', displayName: 'Alex Wilber', mail: 'alex@contoso.com' }, { ok: true, value: [] }, out);
  assert.deepEqual(mailbox.fullAccess, [{ name: 'megan@contoso.com', rights: ['FullAccess'] }]);
  assert.deepEqual(mailbox.sendAs, [], 'NT AUTHORITY\\SELF is not a delegate');
  assert.deepEqual(mailbox.sendOnBehalf, [{ name: 'Adele Vance' }]);
  assert.deepEqual(mailbox.granted.fullAccess, [{ name: 'Sales', address: 'sales@contoso.com', rights: ['FullAccess'] }]);
  assert.deepEqual(mailbox.granted.sendAs, [{ name: 'Sales' }]);
  assert.deepEqual(mailbox.granted.sendOnBehalf, [{ name: 'Sales', address: 'sales@contoso.com' }]);
  assert.equal(mailbox.quota, '99 GB (106,300,440,576 bytes)');
  assert.equal(mailbox.size, '1.2 GB');
  assert.equal(mailbox.fullError, null);
});

test('a raw read with non-string dictionary keys is flattened instead of failing the whole call', { skip: !hasPwsh && 'pwsh not installed' }, () => {
  const out = runMode('adminaudit');
  assert.equal(out.ok, true, JSON.stringify(out));
  const changes = out.commands.find(c => c.name === 'changes');
  assert.equal(changes.ok, true);
  assert.deepEqual(changes.value[0].Parameters, ['1=odd key']);
  assert.equal(out.commands.find(c => c.name === 'config').ok, true);
});
