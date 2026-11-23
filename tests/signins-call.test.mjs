import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signInsPath, loadSignIns } from '../server/live.mjs';
import { classifyStatus } from '../lib/permissions.js';

const NOW = Date.parse('2026-11-23T05:00:00Z');

test('sign-ins query never sends $orderby (Graph answers UnknownError to it)', () => {
  const path = signInsPath({ id: 'aaaaaaaa-0000-4000-8000-00000000c0de', upn: 'AdeleV@contoso.com' }, NOW);
  assert.doesNotMatch(path, /orderby/i);
  const filter = decodeURIComponent(path.match(/\$filter=([^&]+)/)[1]);
  assert.equal(filter, "userId eq 'aaaaaaaa-0000-4000-8000-00000000c0de' and createdDateTime ge 2026-10-24T05:00:00Z");
  assert.match(path, /&\$top=50$/);
});

test('sign-ins falls back to the UPN when the recipient has no Entra object id', () => {
  const filter = decodeURIComponent(signInsPath({ id: 'room@contoso.com', upn: "O'Neil@Contoso.com" }, NOW).match(/\$filter=([^&]+)/)[1]);
  assert.equal(filter, "userPrincipalName eq 'o''neil@contoso.com' and createdDateTime ge 2026-10-24T05:00:00Z");
});

test('loadSignIns reads one page with the fixed query', async () => {
  const seen = [];
  const real = globalThis.fetch;
  globalThis.fetch = async url => { seen.push(String(url)); return new Response(JSON.stringify({ value: [{ id: 'a' }], '@odata.nextLink': 'https://graph.microsoft.com/v1.0/next' }), { status: 200 }); };
  try {
    const res = await loadSignIns('t', { id: 'aaaaaaaa-0000-4000-8000-00000000c0de', upn: 'x@y.com' });
    assert.equal(res.ok, true);
    assert.equal(seen.length, 1);
    assert.doesNotMatch(seen[0], /orderby/i);
  } finally { globalThis.fetch = real; }
});

test('an empty UnknownError becomes plain words, with the raw body under Details', () => {
  const body = { error: { code: 'UnknownError', message: '', innerError: { date: '2026-11-23T04:57:59', 'request-id': 'aaaaaaaa-0000-4000-8000-00000000c0de' } } };
  const r = classifyStatus(400, body, 'signins');
  assert.equal(r.label, 'Call failed');
  assert.doesNotMatch(r.message, /[{}"]/);
  assert.match(r.message, /without giving a reason \(HTTP 400, UnknownError\)/);
  assert.match(r.message, /Request ID: aaaaaaaa-0000-4000-8000-00000000c0de, at 2026-11-23T04:57:59 UTC\./);
  assert.match(r.detail, /"code":"UnknownError"/);
});

test('other failures say what Microsoft said, not JSON', () => {
  assert.match(classifyStatus(400, { error: { code: 'BadRequest', message: 'Invalid filter clause' } }, 'signins').message, /^Microsoft refused the request as Ex360 sent it \(HTTP 400, BadRequest\)\. It said: Invalid filter clause$/);
  assert.match(classifyStatus(429, { error: { code: 'TooManyRequests', message: 'x' } }, 'signins').message, /Wait a minute/);
  assert.match(classifyStatus(504, '', 'signins').message, /did not answer in time \(HTTP 504\)/);
  // Permission and license answers are unchanged.
  assert.equal(classifyStatus(403, { error: { code: 'Authorization_RequestDenied', message: '' } }, 'signins').label, 'Not authorized');
  assert.equal(classifyStatus(403, { error: { code: 'Authentication_RequestFromNonPremiumTenantOrB2CTenant', message: '' } }, 'signins').label, 'License required');
});

test('the full mailbox report reads sign-ins without $orderby too', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../server/report.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /orderby/i);
  assert.match(src, /signInsPath\(\{ id: user\.json\.id, upn, top: 15 \}\)/);
});

test('the cached mailbox read is not tied to the page that started it', async () => {
  const { readFileSync } = await import('node:fs');
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const body = app.slice(app.indexOf('function loadReport('), app.indexOf('const REPORT_WAIT_MS'));
  assert.match(body, /rawGet\(`\/api\/report\?/);
  assert.doesNotMatch(body, /= get\(/);
  assert.match(body, /return stillCurrent\(state\.report\.promise\)/);
  assert.match(app, /label: 'Still no answer'/);
});

test('Findings says what it is and where it comes from', async () => {
  const { readFileSync } = await import('node:fs');
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /Findings are settings on this recipient that are worth a second look/);
  assert.match(app, /Source: Exchange Online PowerShell\. Forwarding and holds come from Get-Mailbox/);
});
