// Log text with secrets removed. Tokens, authorization codes, and PKCE verifiers never reach stdout.
const JWT = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;
const BEARER = /Bearer\s+\S+/gi;
const PARAM = /\b(code|code_verifier|access_token|refresh_token|client_secret|client_assertion)=([^&\s]+)/gi;

export function redact(text) {
  return String(text || '')
    .replace(JWT, '[redacted]')
    .replace(BEARER, 'Bearer [redacted]')
    .replace(PARAM, '$1=[redacted]');
}

export function clip(text, limit = 300) {
  const value = redact(text).replace(/\s+/g, ' ').trim();
  return value.length > limit ? value.slice(0, limit) : value;
}

export function aadstsOf(text) {
  const match = String(text || '').match(/AADSTS\d{3,}/);
  return match ? match[0] : '';
}
