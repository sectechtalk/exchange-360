import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { hopForPermission, loginPath, callbackLocation, remainingHops, safePage } from '../lib/hops.js';
import { COMPLIANCE_GRAPH_SCOPES, IPPS_SCOPE, EXO_SCOPE, authorizeUrl, refreshRequestBody } from '../lib/authflow.js';
import { redact, clip, aadstsOf } from '../lib/logsafe.js';
import { logLine, logTokenError, logPowershellFailure } from '../server/log.mjs';
import { notAuthorized } from '../lib/permissions.js';

test('second-hop permissions map to the sign-in that grants them', () => {
  assert.equal(hopForPermission('Exchange.Manage').resource, 'exchange');
  assert.equal(hopForPermission('Organization.Read.All'), null);
  for (const name of COMPLIANCE_GRAPH_SCOPES) assert.equal(hopForPermission(name).resource, 'purview', name);
  assert.equal(hopForPermission(IPPS_SCOPE).resource, 'compliance');
  const denied = notAuthorized('exchange', 'Sign in again and grant Exchange.Manage when asked.');
  assert.equal(hopForPermission(denied.permission).button, 'Sign in for Exchange Online');
});

test('login links name the hop, the page, and consent, and reject an open redirect', () => {
  const href = loginPath({ resource: 'exchange', returnTo: 'dlp', consent: true });
  assert.equal(href, '/auth/login?resource=exchange&return=dlp&consent=1');
  assert.equal(safePage('https://evil.example'), '');
  assert.equal(callbackLocation({ returnTo: 'https://evil.example/phish', next: 'javascript:alert(1)' }), '/#start');
  assert.equal(callbackLocation({ returnTo: 'mb-compliance', next: 'purview,compliance,https://evil' }), '/auth/login?resource=purview&return=mb-compliance&next=compliance');
  assert.equal(callbackLocation({ returnTo: 'changes' }), '/#changes');
});

test('connect everything skips hops that are already connected', () => {
  assert.deepEqual(remainingHops({ exchange: false, purview: false, compliance: false }), ['exchange', 'purview', 'compliance']);
  assert.deepEqual(remainingHops({ exchange: true, purview: false, compliance: true }), ['purview']);
  const href = loginPath({ resource: 'exchange', returnTo: 'org', next: ['purview', 'compliance'], consent: true });
  assert.match(href, /resource=exchange/);
  assert.match(href, /next=purview%2Ccompliance/);
});

test('logs keep the AADSTS code and drop tokens and authorization codes', () => {
  const jwt = ['eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiJ1c2VyIn0', 'signatureok'].join('.');
  const raw = `AADSTS65001: consent required. code=abc123 ${jwt} Bearer secret-token`;
  assert.equal(aadstsOf(raw), 'AADSTS65001');
  const cleaned = clip(raw);
  assert.match(cleaned, /AADSTS65001/);
  assert.doesNotMatch(cleaned, /eyJ/);
  assert.doesNotMatch(cleaned, /abc123/);
  assert.doesNotMatch(cleaned, /secret-token/);
  assert.equal(clip('x'.repeat(500)).length, 300);
  const lines = [];
  const write = line => lines.push(line);
  logTokenError('exchange', raw, write);
  logPowershellFailure('ipps', `Connect failed ${raw}`, write);
  logLine('auth.hop', { resource: 'purview', return: 'dlp', access_token: jwt, verifier: 'secret' }, write);
  const joined = lines.join('\n');
  assert.match(joined, /auth\.token/);
  assert.match(joined, /powershell/);
  assert.match(joined, /"mode":"ipps"/);
  assert.doesNotMatch(joined, /eyJ|secret-token|abc123|verifier/);
});

test('the exchange hop requests the Office 365 Exchange Online .default scope', () => {
  assert.equal(EXO_SCOPE, 'https://outlook.office365.com/.default');
  const url = authorizeUrl({
    tenant: 'contoso.onmicrosoft.com', clientId: 'app', redirectUri: 'http://localhost:8360/auth/callback',
    scopes: ['openid', 'offline_access', EXO_SCOPE], challenge: 'c', state: 's', prompt: 'consent',
  });
  const scope = new URL(url).searchParams.get('scope');
  assert.equal(scope, 'openid offline_access https://outlook.office365.com/.default');
  const refresh = refreshRequestBody({ clientId: 'app', refreshToken: 'r', scope: `offline_access ${EXO_SCOPE}` });
  assert.equal(refresh.get('scope'), 'offline_access https://outlook.office365.com/.default');
  assert.doesNotMatch(`${scope} ${refresh.get('scope')}`, /Exchange\.Manage/);
});

test('the exchange hop logs its start and does not log a code', async () => {
  const port = 8393;
  const child = spawn(process.execPath, ['server/index.mjs'], {
    cwd: path.resolve(import.meta.dirname, '..'),
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', ENTRA_TENANT_ID: 'contoso.onmicrosoft.com', ENTRA_CLIENT_ID: 'app', EX360_DEMO: '1', EXO_SCOPE: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server did not start')), 8000);
    child.stdout.on('data', chunk => { if (String(chunk).includes('listening')) { clearTimeout(timer); resolve(); } });
  });
  try {
    const res = await fetch(`http://127.0.0.1:${port}/auth/login?resource=exchange&return=dlp&next=purview,https://evil.example`, { redirect: 'manual' });
    assert.equal(res.status, 302);
    const location = res.headers.get('location');
    assert.match(location, /login\.microsoftonline\.com/);
    // The consent screen is not forced. Entra shows it by itself when consent is missing.
    assert.doesNotMatch(location, /prompt=consent/);
    assert.equal(new URL(location).searchParams.get('scope'), 'openid offline_access https://outlook.office365.com/.default');
    assert.doesNotMatch(location, /Exchange\.Manage/);
    assert.doesNotMatch(location, /evil\.example/);
    assert.match(output, /"event":"auth\.hop"/);
    assert.match(output, /"resource":"exchange"/);
    assert.match(output, /"return":"dlp"/);
    assert.match(output, /"next":"purview"/);
    assert.doesNotMatch(output, /code_verifier|eyJ/);
    // Connect everything with no sign-in yet goes to the first sign-in, keeping only a real page id.
    const all = await fetch(`http://127.0.0.1:${port}/auth/connect-all?return=setup`, { redirect: 'manual' });
    assert.equal(all.status, 302);
    assert.equal(all.headers.get('location'), '/auth/login?return=setup');
    const evil = await fetch(`http://127.0.0.1:${port}/auth/connect-all?return=https://evil.example`, { redirect: 'manual' });
    assert.equal(evil.headers.get('location'), '/auth/login');
  } finally { child.kill(); }
});
