import { aadstsOf, clip } from '../lib/logsafe.js';

const HIDDEN = /token|secret|verifier|authorization|cookie|password/i;

export function logLine(event, fields = {}, write = console.log) {
  const safe = { t: new Date().toISOString(), event: String(event || 'log') };
  for (const [key, value] of Object.entries(fields)) {
    if (HIDDEN.test(key)) continue;
    safe[key] = typeof value === 'string' ? clip(value) : value;
  }
  write(JSON.stringify(safe));
}

export function logTokenError(resource, description, write = console.log) {
  const text = String(description || '');
  logLine('auth.token', { resource: resource || '', aadsts: aadstsOf(text), error: clip(text) }, write);
}

export function logPowershellFailure(mode, text, write = console.log) {
  logLine('powershell', { mode: mode || '', ok: false, error: clip(text) }, write);
}
