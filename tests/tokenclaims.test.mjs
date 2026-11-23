import test from 'node:test';
import assert from 'node:assert/strict';
import { consentGap, delegatedReady, EXCHANGE_DELEGATED_ID } from '../lib/tokenclaims.js';
import { runExo } from '../server/exo.mjs';
import { lookupSignInError } from '../lib/content.js';

function token(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return [header, body, 'sig'].join('.');
}

test('missing Exchange.Manage skips PowerShell and links to API permissions', async () => {
  const access = token({ scp: 'openid profile', aud: 'https://outlook.office365.com' });
  const card = consentGap(access, 'exchange', 'app-id');
  assert.equal(card.authorized, false);
  assert.match(card.message, /Consent for Exchange.Manage is missing/);
  assert.match(card.message, /did not call PowerShell/);
  assert.match(card.consentUrl, /ApplicationMenuBlade\/~\/CallAnAPI\/appId\/app-id/);
  assert.match(card.detail, /Exchange.Manage/);
  assert.equal(JSON.stringify(card).includes(access), false);
  assert.equal(delegatedReady(access, 'exchange'), false);
  const ready = token({ scp: 'Exchange.Manage' });
  assert.equal(consentGap(ready, 'exchange', 'app-id'), null);
  assert.equal(delegatedReady(ready, 'exchange'), true);
  const result = await runExo({ token: access, organization: 'contoso.onmicrosoft.com', userPrincipalName: 'ada@contoso.com', clientId: 'app-id', mode: 'org' });
  assert.match(result.message, /did not call PowerShell/);
  assert.equal(JSON.stringify(result).includes(access), false);
});

test('an empty compliance scp skips Connect-IPPSSession', () => {
  const access = token({ scp: '' });
  const card = consentGap(access, 'compliance', 'app-id');
  assert.match(card.message, /Security & Compliance PowerShell/);
  assert.match(card.consentUrl, /CallAnAPI/);
  const granted = token({ scp: 'UnifiedPolicy.Tenant.Read' });
  assert.equal(consentGap(granted, 'compliance', 'app'), null);
  assert.equal(delegatedReady('', 'compliance'), false);
});

test('playbooks describe missing consent and UnAuthorized', () => {
  const consent = lookupSignInError('Missing Exchange.Manage consent');
  assert.match(consent.fix, new RegExp(EXCHANGE_DELEGATED_ID));
  const denied = lookupSignInError('UnAuthorized');
  assert.match(denied.cause, /UserPrincipalName/);
  assert.match(denied.fix, /300/);
});
