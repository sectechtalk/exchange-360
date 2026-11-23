// One sign-in for all four connections.
// The first interactive sign-in is Graph. Entra returns a refresh token that a public client can
// redeem for any other resource the app already has consent for (Microsoft calls this a
// multi-resource refresh token). Ex360 redeems it, without showing anything, for Exchange Online,
// the Purview Graph scopes and Security & Compliance PowerShell. Only a connection that still
// fails after that needs another trip to Entra, and the caller chains those automatically.
import { decodeJwtPayload, scopeList, delegatedReady } from './tokenclaims.js';
import { COMPLIANCE_GRAPH_SCOPES } from './authflow.js';

export const SILENT_ORDER = ['exchange', 'purview', 'compliance'];

export function hasPurviewScopes(token) {
  const scopes = new Set(scopeList(decodeJwtPayload(token)).map(s => s.toLowerCase()));
  return COMPLIANCE_GRAPH_SCOPES.every(s => scopes.has(s.toLowerCase()));
}

export function isConnected(session, id) {
  if (id === 'exchange') return delegatedReady(session?.exo?.access_token, 'exchange');
  if (id === 'compliance') return delegatedReady(session?.compliance?.access_token, 'compliance');
  if (id === 'purview') return Boolean(session?.purview);
  return Boolean(session?.graph?.access_token);
}

// redeem(id, refreshToken) asks the token endpoint for that connection and returns the token, or throws.
// Returns which connections are now in place and which still need an interactive hop.
export async function connectSilently({ session, redeem, now = Date.now }) {
  const outcome = {};
  const errors = {};
  const refreshToken = session?.graph?.refresh_token;
  if (!refreshToken) {
    return { outcome, errors, connected: [], missing: SILENT_ORDER.filter(id => !isConnected(session, id)) };
  }
  await Promise.all(SILENT_ORDER.map(async id => {
    if (isConnected(session, id)) { outcome[id] = 'already'; return; }
    let token;
    try {
      token = await redeem(id, refreshToken);
    } catch (error) {
      outcome[id] = 'failed';
      errors[id] = error;
      return;
    }
    if (!token?.access_token) { outcome[id] = 'failed'; return; }
    if (!token.refresh_token) token.refresh_token = refreshToken;
    if (id === 'exchange') {
      session.exo = token;
      session.exoTriedAt = now();
      if (delegatedReady(token.access_token, 'exchange')) session.exoError = null;
    } else if (id === 'compliance') {
      session.compliance = token;
    } else if (hasPurviewScopes(token.access_token)) {
      // The Purview token is a Graph token with six more scopes, so it replaces the Graph token.
      session.graph = token;
      session.purview = true;
    }
    outcome[id] = isConnected(session, id) ? 'silent' : 'not-ready';
  }));
  return {
    outcome,
    errors,
    connected: SILENT_ORDER.filter(id => isConnected(session, id)),
    missing: SILENT_ORDER.filter(id => !isConnected(session, id)),
  };
}
