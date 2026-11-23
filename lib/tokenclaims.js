// Read a JWT payload only. No signature check, and the token itself is never returned or logged.
import { notAuthorized } from './permissions.js';

export const EXCHANGE_DELEGATED_SCOPE = 'Exchange.Manage';
export const EXCHANGE_DELEGATED_ID = 'ab4f2b77-0b06-4fc1-a9de-02113fc2ab7c';

export function decodeJwtPayload(token) {
  const parts = String(token || '').split('.');
  if (parts.length < 2 || !parts[1]) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return payload && typeof payload === 'object' ? payload : null;
  } catch {
    return null;
  }
}

export function scopeList(payload) {
  return String(payload?.scp || '').split(/\s+/).filter(Boolean);
}

export function apiPermissionsUrl(clientId) {
  const id = String(clientId || '').trim() || 'your-client-id';
  return `https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/CallAnAPI/appId/${id}/isMSAApp~/false`;
}

export function consentGap(token, kind, clientId) {
  const payload = decodeJwtPayload(token);
  const scopes = scopeList(payload);
  const consentUrl = apiPermissionsUrl(clientId);
  if (kind === 'compliance') {
    if (payload && scopes.length) return null;
    const card = notAuthorized('ipps');
    card.message = 'Consent for Security & Compliance PowerShell is missing. The compliance token has no scp permissions, so Ex360 did not call PowerShell.';
    card.consentUrl = consentUrl;
    card.detail = 'scp is empty. Grant admin consent for the Ex360 app on the API permissions page, then sign in for compliance PowerShell again.';
    return card;
  }
  if (payload && scopes.includes(EXCHANGE_DELEGATED_SCOPE)) return null;
  const card = notAuthorized('exchange');
  card.message = 'Consent for Exchange.Manage is missing. The Exchange token does not include that permission, so Ex360 did not call PowerShell.';
  card.consentUrl = consentUrl;
  card.detail = `scp does not include ${EXCHANGE_DELEGATED_SCOPE} (${EXCHANGE_DELEGATED_ID}). Grant admin consent for the Ex360 app on the API permissions page, then sign in for Exchange Online again.`;
  return card;
}

export function delegatedReady(token, kind) {
  if (!token) return false;
  return consentGap(token, kind, '') == null;
}
