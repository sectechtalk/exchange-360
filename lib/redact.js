import { SHARE_FORMAT, ANALYZER_VERSION } from './analyzer.js';

export { SHARE_FORMAT };

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const IPV6 = /\b(?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}\b/gi;

export function redactText(value) {
  return String(value ?? '')
    .replace(EMAIL, 'user@redacted.example')
    .replace(IPV4, '203.0.113.0')
    .replace(IPV6, '2001:db8::');
}

function walk(value) {
  if (typeof value === 'string') return redactText(value);
  if (Array.isArray(value)) return value.map(walk);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (k === 'raw') continue;
      out[k] = walk(v);
    }
    return out;
  }
  return value;
}

// A share copy keeps the verdicts and the hop list, and removes addresses, IPs and raw header text.
export function shareCopy(analysis) {
  const copy = walk(analysis);
  return {
    format: SHARE_FORMAT,
    version: ANALYZER_VERSION,
    sharedAt: null,
    note: 'Addresses and IP addresses were removed. Verdicts, hop order and delays were kept. Do not treat this file as the original message.',
    analysis: copy,
  };
}

export function isShareCopy(value) {
  return Boolean(value && value.format === SHARE_FORMAT && value.analysis);
}
