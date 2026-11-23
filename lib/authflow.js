// Authorization-code + PKCE for a public client. No client secret is sent.
// Graph and Exchange Online are different resources, so they are two sign-in hops.
import { createHash, randomBytes } from 'node:crypto';

export const DEFAULT_GRAPH_SCOPES = [
  'openid', 'profile', 'offline_access', 'User.Read', 'User.Read.All', 'Directory.Read.All',
  'Organization.Read.All', 'Domain.Read.All', 'Policy.Read.All', 'AuditLog.Read.All', 'Reports.Read.All',
  'ServiceHealth.Read.All', 'ServiceMessage.Read.All', 'SecurityEvents.Read.All', 'Mail.Read',
  'Mail.Read.Shared', 'MailboxSettings.Read', 'RoleManagement.Read.Directory',
];

// Static permissions already on the app for Office 365 Exchange Online, including Exchange.Manage.
// The bare scope name Exchange.Manage is resolved against Microsoft Graph and fails with AADSTS650053.
// Exchange Online PowerShell requests this .default scope for the outlook.office365.com resource.
export const EXO_SCOPE = 'https://outlook.office365.com/.default';
// Security & Compliance PowerShell. Learn documents Connect-IPPSSession -AccessToken and the
// endpoint https://ps.compliance.protection.outlook.com/powershell-liveid/. It does not publish
// a delegated permission GUID for a customer app. This is a separate token from Graph.
export const IPPS_SCOPE = 'https://ps.compliance.protection.outlook.com/.default';
export const COMPLIANCE_GRAPH_SCOPES = [
  'InformationProtectionPolicy.Read',
  'RecordsManagement.Read.All',
  'eDiscovery.Read.All',
  'AuditLogsQuery.Read.All',
  'SecurityAlert.Read.All',
  'SecurityIncident.Read.All',
];

export function pkcePair() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge, method: 'S256' };
}

export function authorizeUrl({ tenant, clientId, redirectUri, scopes, challenge, state, prompt, loginHint }) {
  if (!tenant || !clientId || !redirectUri) throw new Error('Sign-in needs a tenant id, a client id and a redirect URI.');
  const url = new URL(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_mode', 'query');
  url.searchParams.set('scope', scopes.join(' '));
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', state);
  if (prompt) url.searchParams.set('prompt', prompt);
  if (loginHint) url.searchParams.set('login_hint', loginHint);
  return url.toString();
}

function publicClientBody(fields) {
  const body = new URLSearchParams(fields);
  if (body.has('client_secret') || body.has('client_assertion')) {
    throw new Error('A public client must not send a client secret or a client assertion.');
  }
  return body;
}

export function tokenRequestBody({ clientId, redirectUri, code, verifier, scope }) {
  return publicClientBody({
    client_id: clientId,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
    scope,
  });
}

export function refreshRequestBody({ clientId, refreshToken, scope }) {
  return publicClientBody({
    client_id: clientId,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope,
  });
}

export function tokenEndpoint(tenant) {
  return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
}
