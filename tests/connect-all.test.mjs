import test from 'node:test';
import assert from 'node:assert/strict';
import { connectSilently, hasPurviewScopes, isConnected } from '../lib/connect-all.js';
import { COMPLIANCE_GRAPH_SCOPES, EXO_SCOPE, IPPS_SCOPE } from '../lib/authflow.js';
import { connectAllPath, callbackLocation, safeChain } from '../lib/hops.js';

const jwt = payload => ['eyJhbGciOiJub25lIn0', Buffer.from(JSON.stringify(payload)).toString('base64url'), 'sig'].join('.');
const graphScopes = 'User.Read Directory.Read.All';
const tokens = {
  exchange: { access_token: jwt({ aud: 'https://outlook.office365.com', scp: 'Exchange.Manage' }), refresh_token: 'rt-exo' },
  purview: { access_token: jwt({ aud: '00000003-0000-0000-c000-000000000000', scp: `${graphScopes} ${COMPLIANCE_GRAPH_SCOPES.join(' ')}` }), refresh_token: 'rt-pv' },
  compliance: { access_token: jwt({ aud: 'https://ps.compliance.protection.outlook.com', scp: 'user_impersonation' }) },
};
const freshSession = () => ({ graph: { access_token: jwt({ scp: graphScopes }), refresh_token: 'rt-graph' }, exo: null, compliance: null, purview: false, account: {} });

test('one Graph sign-in connects Exchange, Purview Graph and compliance PowerShell without another prompt', async () => {
  const session = freshSession();
  const calls = [];
  const result = await connectSilently({ session, redeem: async (id, rt) => { calls.push([id, rt]); return { ...tokens[id] }; } });
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.connected, ['exchange', 'purview', 'compliance']);
  assert.deepEqual(result.outcome, { exchange: 'silent', purview: 'silent', compliance: 'silent' });
  // Every connection is redeemed from the first sign-in's refresh token.
  assert.deepEqual(calls.map(c => c[1]), ['rt-graph', 'rt-graph', 'rt-graph']);
  assert.equal(session.purview, true);
  assert.equal(session.graph.refresh_token, 'rt-pv');
  assert.equal(session.compliance.refresh_token, 'rt-graph', 'a token without its own refresh token keeps the Graph one');
  for (const id of ['graph', 'exchange', 'purview', 'compliance']) assert.equal(isConnected(session, id), true, id);
});

test('a connection that cannot be had silently is returned so the sign-in chains to it', async () => {
  const session = freshSession();
  const oldGraph = session.graph;
  const result = await connectSilently({
    session,
    redeem: async id => {
      if (id === 'compliance') { const e = new Error('AADSTS50076: multi-factor authentication required'); throw e; }
      if (id === 'purview') return { access_token: jwt({ scp: graphScopes }) }; // consent missing: scopes not in the token
      return { ...tokens[id] };
    },
  });
  assert.deepEqual(result.missing, ['purview', 'compliance']);
  assert.equal(result.outcome.compliance, 'failed');
  assert.equal(result.outcome.purview, 'not-ready');
  assert.match(result.errors.compliance.message, /AADSTS50076/);
  assert.equal(session.graph, oldGraph, 'a Graph token without the Purview scopes does not replace the working one');
  assert.equal(session.purview, false);
  assert.equal(isConnected(session, 'exchange'), true);
  // The callback puts the missing ones in front of the chain and the browser goes straight on.
  assert.equal(callbackLocation({ returnTo: 'setup', next: safeChain(result.missing) }), '/auth/login?resource=purview&return=setup&next=compliance');
});

test('connections already in place are not asked for again', async () => {
  const session = { ...freshSession(), exo: { ...tokens.exchange }, compliance: { ...tokens.compliance } };
  const asked = [];
  const result = await connectSilently({ session, redeem: async id => { asked.push(id); return { ...tokens[id] }; } });
  assert.deepEqual(asked, ['purview']);
  assert.deepEqual(result.missing, []);
});

test('without a refresh token nothing is redeemed and everything is still missing', async () => {
  const result = await connectSilently({ session: { graph: { access_token: 'x' } }, redeem: async () => { throw new Error('should not be called'); } });
  assert.deepEqual(result.missing, ['exchange', 'purview', 'compliance']);
});

test('the Purview check needs all six Purview Graph scopes', () => {
  assert.equal(hasPurviewScopes(tokens.purview.access_token), true);
  assert.equal(hasPurviewScopes(jwt({ scp: COMPLIANCE_GRAPH_SCOPES.slice(1).join(' ') })), false);
  assert.equal(hasPurviewScopes('not-a-jwt'), false);
});

test('Connect everything links to the server route and keeps only a real page', () => {
  assert.equal(connectAllPath('setup'), '/auth/connect-all?return=setup');
  assert.equal(connectAllPath('https://evil.example'), '/auth/connect-all');
  assert.ok(EXO_SCOPE && IPPS_SCOPE);
});
