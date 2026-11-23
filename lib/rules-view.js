// Mail flow rules, shaped the way the Exchange admin center's Mail flow > Rules list shows them.
// Portal columns (new EAC, 2026): Status, Rule, Priority, Stop processing rules, Size (Bytes),
// Last execution, Configuration supported, Unsupported reason.
// Pure functions so the page and the tests share them.

export const RULE_COLUMNS = ['Status', 'Rule', 'Priority', 'Stop processing rules', 'Size (Bytes)', 'Last execution', 'Configuration supported', 'Unsupported reason'];

const truthy = v => v === true || v === 'True' || v === 'true';
const falsy = v => v === false || v === 'False' || v === 'false';

// Size can arrive as a number, "434", or a quantity string like "434 B (434 bytes)".
export function ruleSize(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return value;
  const bytes = String(value).match(/\(([\d,]+) bytes\)/i) || String(value).match(/^\s*([\d,]+)\s*(?:B|bytes)?\s*$/i);
  return bytes ? Number(bytes[1].replace(/,/g, '')) : null;
}

// "1 month ago", the way the portal words Last execution.
export function timeAgo(value, now = Date.now()) {
  if (!value) return '';
  const t = typeof value === 'number' ? value : Date.parse(String(value).replace(/^\/Date\((\d+)\)\/$/, (_, ms) => new Date(Number(ms)).toISOString()));
  if (!Number.isFinite(t)) return String(value);
  const s = Math.max(0, Math.round((now - t) / 1000));
  const steps = [[60, 'second'], [60, 'minute'], [24, 'hour'], [30, 'day'], [12, 'month'], [Infinity, 'year']];
  let n = s;
  for (const [size, unit] of steps) {
    if (n < size) return n <= 1 && unit === 'second' ? 'Just now' : `${n} ${unit}${n === 1 ? '' : 's'} ago`;
    n = Math.floor(n / size);
  }
  return '';
}
function stamp(value) {
  if (!value) return null;
  const m = String(value).match(/^\/Date\((\d+)\)\/$/);
  const t = m ? Number(m[1]) : Date.parse(String(value));
  return Number.isFinite(t) ? t : null;
}

// One row of the rules list. Missing values stay null so the page shows a dash, never a guess.
export function ruleListRow(rule, now = Date.now()) {
  const supported = rule.ConfigurationSupported ?? rule.IsRuleConfigurationSupported;
  const last = rule.LastExecution ?? rule.LastExecutionTime ?? null;
  return {
    status: rule.State || (rule.state ? String(rule.state) : '') || '—',
    name: rule.Name || rule.name || '',
    priority: rule.Priority ?? rule.priority ?? null,
    stop: truthy(rule.StopRuleProcessing) ? true : falsy(rule.StopRuleProcessing) ? false : null,
    size: ruleSize(rule.Size),
    lastExecution: last,
    lastExecutionAt: stamp(last),
    lastExecutionWords: last ? timeAgo(last, now) : '',
    supported: truthy(supported) ? true : falsy(supported) ? false : null,
    unsupportedReason: rule.UnsupportedReason || rule.RuleConfigurationUnsupportedReason || '',
  };
}

// Exchange's Description reads "If the message: ... Take the following actions: ... Except if the message: ...".
// Split it into the three headings the portal's details panel uses.
export function describeRule(description) {
  const text = String(description || '').replace(/\r/g, '');
  const out = { conditions: [], actions: [], exceptions: [] };
  if (!text.trim()) return out;
  let bucket = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (/^If the message:?$/i.test(line)) { bucket = 'conditions'; continue; }
    if (/^Take the following actions?:?$/i.test(line)) { bucket = 'actions'; continue; }
    if (/^Except if the message:?$/i.test(line)) { bucket = 'exceptions'; continue; }
    if (/^and$/i.test(line)) continue;
    (out[bucket || 'conditions']).push(line.replace(/^and\s+/i, ''));
  }
  return out;
}

const SENDER_LOCATION = { Header: 'Header', Envelope: 'Envelope', HeaderOrEnvelope: 'Header or envelope' };
const MODE = { Enforce: 'Enforce', Audit: 'Test without Policy Tips', AuditAndNotify: 'Test with Policy Tips' };
const day = v => (v ? String(v).slice(0, 10) : '');

// The "Rule settings" block of the portal's details panel, in the portal's own labels.
export function ruleSettings(rule) {
  return [
    ['Rule name', rule.Name || ''],
    ['Mode', MODE[rule.Mode] || rule.Mode || '—'],
    ['Set date range', rule.ActivationDate || rule.ExpiryDate ? `${day(rule.ActivationDate) || 'Any time'} to ${day(rule.ExpiryDate) || 'no end date'}` : 'Not set'],
    ['Priority', rule.Priority ?? '—'],
    ['Severity', rule.SetAuditSeverity || 'Not specified'],
    ['Senders address', SENDER_LOCATION[rule.SenderAddressLocation] || rule.SenderAddressLocation || '—'],
    ['Stop processing more rules', truthy(rule.StopRuleProcessing) ? 'Yes' : falsy(rule.StopRuleProcessing) ? 'No' : '—'],
    ['Defer the message if rule processing doesn\'t complete', rule.RuleErrorAction ? (rule.RuleErrorAction === 'Defer' ? 'Yes' : 'No') : '—'],
    ['Comments', rule.Comments || ''],
    ['Last modified', rule.WhenChanged ? String(rule.WhenChanged).replace('T', ' ').slice(0, 16) : '—'],
  ];
}

// Plain-words warnings worth seeing before you trust a rule.
export function ruleWarnings(rule) {
  const out = [];
  if (rule.State && rule.State !== 'Enabled') out.push('This rule is turned off, so it does nothing.');
  if (rule.Mode && rule.Mode !== 'Enforce') out.push(`This rule is in test mode (${MODE[rule.Mode] || rule.Mode}). It logs matches but does not act on mail.`);
  if (Number(rule.SetSCL) === -1) out.push('This rule sets SCL -1, so matching mail skips spam filtering.');
  if (truthy(rule.StopRuleProcessing)) out.push('Rules with a higher priority number never run for mail this rule matches.');
  if (rule.ExpiryDate) out.push(`This rule stops on ${day(rule.ExpiryDate)}.`);
  if (falsy(rule.ConfigurationSupported ?? rule.IsRuleConfigurationSupported)) out.push(`The portal cannot edit this rule${rule.UnsupportedReason ? `: ${String(rule.UnsupportedReason).replace(/\.$/, '')}` : ''}. Change it in PowerShell.`);
  return out;
}
