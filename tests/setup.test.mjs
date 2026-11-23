import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import {
  evaluateSetup, setupRecord, versionAtLeast, requestedScopeNames, adminConsentedScopes, graphScopesNeeded,
  GRAPH_APP_ID, EXO_APP_ID,
} from '../lib/setup.js';
import { classifyStatus } from '../lib/permissions.js';
import { DEFAULT_GRAPH_SCOPES } from '../lib/authflow.js';
import { checkOpenId } from '../server/setup.mjs';

const TENANT = 'aaaaaaaa-0000-4000-8000-000000000001';
const CLIENT = 'aaaaaaaa-0000-4000-8000-000000000002';
const env = { tenantId: TENANT, clientId: CLIENT, organization: 'contoso.onmicrosoft.com', redirectUri: 'http://localhost:8360/auth/callback', exoScope: 'https://outlook.office365.com/.default' };
const needed = graphScopesNeeded(DEFAULT_GRAPH_SCOPES);
const catalog = {
  graph: needed.map((value, i) => ({ id: `g-${i}`, value })),
  exo: [{ id: 'ab4f2b77-0b06-4fc1-a9de-02113fc2ab7c', value: 'Exchange.Manage' }],
};
const goodApp = {
  ok: true,
  value: {
    isFallbackPublicClient: true,
    publicClient: { redirectUris: [env.redirectUri, 'http://localhost'] },
    web: { redirectUris: [] },
    spa: { redirectUris: [] },
    requiredResourceAccess: [
      { resourceAppId: GRAPH_APP_ID, resourceAccess: catalog.graph.map(s => ({ id: s.id, type: 'Scope' })) },
      { resourceAppId: EXO_APP_ID, resourceAccess: [{ id: 'ab4f2b77-0b06-4fc1-a9de-02113fc2ab7c', type: 'Scope' }] },
    ],
  },
};
const goodGrants = {
  ok: true,
  resourceSp: { graph: 'sp-graph', exo: 'sp-exo' },
  value: [
    { consentType: 'AllPrincipals', resourceId: 'sp-graph', scope: needed.join(' ') },
    { consentType: 'AllPrincipals', resourceId: 'sp-exo', scope: 'Exchange.Manage' },
  ],
};
function allGood(overrides = {}) {
  return {
    env, graphScopes: DEFAULT_GRAPH_SCOPES, browserHost: 'localhost:8360',
    openid: { ok: true }, powershell: { ok: true, pwsh: '7.4.6', module: '3.9.0' },
    session: { signedIn: true, upn: 'admin@contoso.onmicrosoft.com', graphScopes: needed, roles: ['Global Administrator'], exo: { present: true, ready: true }, purview: false, compliance: false },
    app: goodApp, grants: goodGrants, catalog, tenantName: 'Contoso', exoLive: { ok: true, organization: 'contoso.onmicrosoft.com', user: 'admin@contoso.onmicrosoft.com' },
    outlookReports: 0,
    ...overrides,
  };
}
const byId = (result, id) => result.rows.find(r => r.id === id);

test('everything in place reads as ready, and optional rows do not count', () => {
  const result = evaluateSetup(allGood());
  assert.equal(result.summary.ready, true, JSON.stringify(result.rows.filter(r => r.status !== 'pass' && r.group !== 'Optional'), null, 1));
  assert.equal(result.summary.fail, 0);
  assert.equal(byId(result, 'purview').status, 'optional');
});

test('missing Exchange.Manage admin consent fails with the Grant admin consent step and link', () => {
  const grants = { ...goodGrants, value: [goodGrants.value[0]] };
  const result = evaluateSetup(allGood({ grants, session: { ...allGood().session, exo: { present: false, ready: false, error: 'AADSTS65001: consent required' } }, exoLive: null }));
  const row = byId(result, 'consent-exo');
  assert.equal(row.status, 'fail');
  assert.match(row.summary, /Exchange\.Manage/);
  assert.match(row.fix.steps.join(' '), /Grant admin consent for Contoso/);
  assert.match(row.fix.link.url, new RegExp(`CallAnAPI/appId/${CLIENT}`));
  assert.equal(byId(result, 'consent-graph').status, 'pass');
  assert.equal(byId(result, 'token-exo').status, 'fail');
  assert.match(byId(result, 'token-exo').summary, /AADSTS65001/);
  assert.equal(result.summary.ready, false);
});

test('a Web redirect URI fails and names AADSTS7000218', () => {
  const app = { ok: true, value: { ...goodApp.value, web: { redirectUris: [env.redirectUri] }, publicClient: { redirectUris: [] } } };
  const row = byId(evaluateSetup(allGood({ app })), 'platform');
  assert.equal(row.status, 'fail');
  assert.match(row.summary, /AADSTS7000218/);
  assert.match(row.fix.steps.join(' '), /Mobile and desktop applications/);
});

test('an old EXO_SCOPE=Exchange.Manage in .env is caught', () => {
  const row = byId(evaluateSetup(allGood({ env: { ...env, exoScope: 'https://outlook.office365.com/Exchange.Manage' } })), 'exo-scope');
  assert.equal(row.status, 'fail');
  assert.match(row.summary, /AADSTS650053/);
});

test('opening 127.0.0.1 instead of localhost is caught', () => {
  const row = byId(evaluateSetup(allGood({ browserHost: '127.0.0.1:8360' })), 'redirect');
  assert.equal(row.status, 'fail');
  assert.equal(row.action.href, 'http://localhost:8360/#setup');
});

test('not signed in: the token checks wait, and a restart is explained', () => {
  const signedOut = allGood({ session: { signedIn: false, staleCookie: true, exo: {} }, app: undefined, grants: undefined, exoLive: null });
  const result = evaluateSetup(signedOut);
  assert.equal(byId(result, 'signin').status, 'fail');
  assert.match(byId(result, 'signin').summary, /restarted/);
  assert.equal(byId(result, 'consent-exo').status, 'wait');
  assert.equal(byId(result, 'token-graph').status, 'wait');
});

test('no active Exchange-capable role fails with the PIM step', () => {
  const row = byId(evaluateSetup(allGood({ session: { ...allGood().session, roles: ['Reports Reader'] } })), 'role');
  assert.equal(row.status, 'fail');
  assert.match(row.fix.steps.join(' '), /Activate/);
});

test('an old Exchange module fails', () => {
  assert.equal(versionAtLeast('3.9.0', '3.7.2'), true);
  assert.equal(versionAtLeast('3.7.2', '3.7.2'), true);
  assert.equal(versionAtLeast('3.6.0', '3.7.2'), false);
  const row = byId(evaluateSetup(allGood({ powershell: { ok: true, pwsh: '7.4.6', module: '3.4.0' } })), 'pwsh');
  assert.equal(row.status, 'fail');
});

test('a live PowerShell failure shows the real error under Details', () => {
  const row = byId(evaluateSetup(allGood({ exoLive: { ok: false, message: 'UnAuthorized', detail: 'Connect-ExchangeOnline: UnAuthorized' } })), 'exo-live');
  assert.equal(row.status, 'fail');
  assert.match(row.detail, /UnAuthorized/);
});

test('scope helpers map ids to names and only count tenant-wide grants', () => {
  assert.deepEqual(requestedScopeNames(goodApp.value, EXO_APP_ID, catalog.exo), ['Exchange.Manage']);
  const granted = adminConsentedScopes([{ consentType: 'Principal', resourceId: 'sp-exo', scope: 'Exchange.Manage' }], 'sp-exo');
  assert.equal(granted.size, 0);
  assert.equal(graphScopesNeeded(['openid', 'profile', 'offline_access', 'User.Read', 'https://outlook.office365.com/.default']).join(), 'User.Read');
});

test('the written record lists every one-off setting', () => {
  const record = setupRecord(env, DEFAULT_GRAPH_SCOPES).map(r => `${r.item} ${r.value}`).join(' | ');
  for (const item of ['App registration', 'Platform', 'Allow public client flows', 'Admin consent', 'Exchange.Manage', 'Your role', 'Container', 'Browser address']) assert.match(record, new RegExp(item.replace('.', '\\.')));
});

test('an expired token is not reported as a missing permission', () => {
  const expired = classifyStatus(401, { error: { code: 'InvalidAuthenticationToken', message: 'Lifetime validation failed, the token is expired.' } }, 'skus');
  assert.equal(expired.expired, true);
  assert.equal(expired.label, 'Sign in again');
  assert.equal(classifyStatus(401, 'no token', 'skus').label, 'Not authorized');
  assert.equal(classifyStatus(403, { error: { code: 'Authorization_RequestDenied' } }, 'skus').label, 'Not authorized');
});

test('a wrong tenant id is reported in plain words', async () => {
  const fake = async () => ({ ok: false, status: 400, json: async () => ({ error: 'invalid_tenant', error_description: "AADSTS90002: Tenant 'x' not found." }) });
  const result = await checkOpenId('x', fake);
  assert.equal(result.ok, false);
  assert.match(result.message, /does not exist/);
  const down = await checkOpenId('x', async () => { throw Object.assign(new Error('fetch failed'), { cause: { code: 'ENOTFOUND' } }); });
  assert.match(down.message, /could not reach/);
});

test('the setup endpoint answers without a sign-in and makes no changes', async () => {
  const port = 8394;
  const child = spawn(process.execPath, ['server/index.mjs'], {
    cwd: path.resolve(import.meta.dirname, '..'),
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', ENTRA_TENANT_ID: TENANT, ENTRA_CLIENT_ID: CLIENT, ENTRA_REDIRECT_URI: `http://localhost:${port}/auth/callback` },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server did not start')), 8000);
    child.stdout.on('data', chunk => { if (String(chunk).includes('listening')) { clearTimeout(timer); resolve(); } });
  });
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/setup`, { headers: { cookie: 'ex360sid=gone' } });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.ok(data.rows.length >= 12);
    assert.equal(data.rows.find(r => r.id === 'env').status, 'pass');
    assert.equal(data.rows.find(r => r.id === 'redirect').status, 'fail', 'opened on 127.0.0.1, redirect is localhost');
    assert.match(data.rows.find(r => r.id === 'signin').summary, /restarted/);
    assert.ok(data.record.length >= 10);
    const login = await fetch(`http://127.0.0.1:${port}/auth/login?resource=exchange&return=setup`, { redirect: 'manual' });
    assert.doesNotMatch(login.headers.get('location'), /prompt=consent/);
    const forced = await fetch(`http://127.0.0.1:${port}/auth/login?resource=exchange&return=setup&consent=1`, { redirect: 'manual' });
    assert.match(forced.headers.get('location'), /prompt=consent/);
  } finally { child.kill(); }
});
