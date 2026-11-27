import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
function files(dir, ext) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...files(full, ext));
    else if (full.endsWith(ext)) out.push(full);
  }
  return out;
}

const SNAPSHOT_POST = "getJson('/api/snapshots/start', { method: 'POST',";

test('page scripts only GET', () => {
  const offenders = [];
  for (const file of [...files(path.join(root, 'public'), '.js'), ...files(path.join(root, 'lib'), '.js')]) {
    // The one POST a page may send: Config snapshots starting a read-only snapshot saved on the PC (never a tenant write).
    const text = readFileSync(file, 'utf8').replace(SNAPSHOT_POST, '');
    if (/\bfetch\s*\([^)]*method\s*:\s*['"](?!GET)/i.test(text) || /\bmethod:\s*['"](POST|PUT|PATCH|DELETE)['"]/i.test(text)) offenders.push(path.relative(root, file));
  }
  assert.deepEqual(offenders, []);
});

test('the server rejects tenant writes and allows one local collector POST', () => {
  const server = readFileSync(path.join(root, 'server', 'index.mjs'), 'utf8');
  // The only other POST: starting a config snapshot, which reads the tenant (Get- only) and writes a file on the PC.
  assert.match(server, /req\.method === 'POST' && url\.pathname === '\/api\/snapshots\/start'/);
  assert.equal((server.match(/req\.method === 'POST'/g) || []).length, 2);
  assert.match(server, /pathname === '\/api\/outlook-client'/);
  assert.match(server, /req\.method !== 'GET'/);
  assert.doesNotMatch(server, /graph\.microsoft\.com[\s\S]{0,80}method:\s*['"]POST/i);
});

test('Exchange script is Get- only', () => {
  const text = readFileSync(path.join(root, 'server', 'Invoke-Ex360Command.ps1'), 'utf8');
  assert.match(text, /Get-MessageTraceV2/);
  assert.match(text, /Connect-ExchangeOnline -AccessToken/);
  assert.match(text, /Connect-ExchangeOnline -AccessToken \$token -UserPrincipalName/);
  assert.match(text, /Connect-IPPSSession -AccessToken \$token -UserPrincipalName/);
  assert.doesNotMatch(text, /\b(Set|New|Remove|Enable|Disable|Update)-[A-Za-z]+/);
});

for (const file of files(path.join(root, 'public'), '.js')) {
  test(`GET-only file ${path.basename(file)}`, () => {
    const text = readFileSync(file, 'utf8').replace(SNAPSHOT_POST, '');
    assert.doesNotMatch(text, /XMLHttpRequest|\.send\(|axios\.|method:\s*['"]POST/);
  });
}
