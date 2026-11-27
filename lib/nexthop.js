// NextHop: predict what Exchange Online would do with one message, from configuration only.
//
// Input 1, the configuration: a mail flow configuration export (format "sectechtalk.mailflow-config", written by
// export/Export-MailFlowConfig.ps1 against a real tenant, or the built-in Contoso sample topology in
// lib/nexthop-sample.js, which has exactly the same shape).
// Input 2, a test message between the export's one mailbox and a made-up outside address, in either direction.
//
// Nothing is sent, nothing is looked up. There is no DNS (MX, SPF, DKIM, DMARC, MTA-STS): the outside address is fake,
// so its authentication result, its sending IP and the spam filter's verdict are inputs you choose ("mocked").
// Everything else (connectors, mail flow rules, DLP, protection policies, journaling, remote domains, the mailbox's
// own forwarding and inbox rules) is read from the configuration and applied in the order Exchange Online applies it.
//
// Pure: no DOM, no network, no Node APIs. The page, the .mhtml report and the tests share it.

export const NEXTHOP_FORMAT = 'sectechtalk.mailflow-config';

// ---------------------------------------------------------------------------------------------------------------
// Small readers for exported values. Export values are plain JSON, but PowerShell types arrive as text:
// sizes as "36 MB (37,748,736 bytes)", addresses as "smtp:x@y" or "Name [SMTP:x@y]", booleans sometimes as "True".
// ---------------------------------------------------------------------------------------------------------------
export const list = v => (v == null || v === '' ? [] : Array.isArray(v) ? v.filter(x => x != null && x !== '') : [v]);
export const bool = v => v === true || /^true$/i.test(String(v ?? ''));
const str = v => (v == null ? '' : String(v));
const lc = v => str(v).trim().toLowerCase();
const nonEmpty = v => list(v).length > 0;

export function items(cfg, name) { return Array.isArray(cfg?.sections?.[name]?.items) ? cfg.sections[name].items : []; }
export function sectionStatus(cfg, name) { return cfg?.sections?.[name]?.status || 'missing'; }

export function bytesOf(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v;
  const s = String(v);
  if (/^unlimited$/i.test(s.trim())) return Infinity;
  const exact = /\(([\d,]+) bytes\)/i.exec(s);
  if (exact) return Number(exact[1].replace(/,/g, ''));
  const m = /([\d.]+)\s*(B|KB|MB|GB|TB)\b/i.exec(s);
  if (!m) return /^\d+$/.test(s.trim()) ? Number(s.trim()) : null;
  const mult = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 }[m[2].toUpperCase()];
  return Math.round(Number(m[1]) * mult);
}
export function sizeText(bytes) {
  if (bytes == null) return 'unknown';
  if (bytes === Infinity) return 'Unlimited';
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1).replace(/\.0$/, '')} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1).replace(/\.0$/, '')} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} bytes`;
}

const EMAIL = /[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
export function addressOf(v) { const m = EMAIL.exec(str(v)); return m ? m[0].toLowerCase() : ''; }
export function domainOf(address) { const a = lc(address); return a.includes('@') ? a.split('@').pop() : a; }
// Inbound connector SenderDomains come back as "smtp:fabrikam.com;1" or "smtp:*;1".
export function connectorDomain(v) { return lc(v).replace(/^smtp:/, '').replace(/;\d+$/, ''); }
export function domainMatches(domain, pattern) {
  const d = lc(domain); const p = connectorDomain(pattern);
  if (!p) return false;
  if (p === '*') return true;
  if (p.startsWith('*.')) return d === p.slice(2) || d.endsWith(p.slice(1));
  return d === p;
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
// Exchange "contains words": the word or phrase appears on its own, not inside a longer word. Case-insensitive.
export function containsWord(text, word) {
  const w = str(word).trim();
  if (!w) return false;
  return new RegExp(`(^|[^\\p{L}\\p{N}_])${escapeRe(w).replace(/\s+/g, '\\s+')}($|[^\\p{L}\\p{N}_])`, 'iu').test(str(text));
}
export function firstWord(text, words) { return list(words).find(w => containsWord(text, w)) || null; }
export function firstPattern(text, patterns) {
  for (const pat of list(patterns)) {
    try { if (new RegExp(str(pat), 'i').test(str(text))) return pat; } catch { /* Exchange regex Ex360 cannot read */ }
  }
  return null;
}

// IPv4 only: single address, CIDR (203.0.113.0/24) or range (203.0.113.1-203.0.113.9).
function ipNum(ip) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(str(ip).trim());
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some(n => n > 255)) return null;
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}
export function ipInRange(ip, range) {
  const n = ipNum(ip);
  if (n == null) return false;
  const r = str(range).trim();
  if (r.includes('/')) {
    const [base, bits] = r.split('/');
    const b = ipNum(base); const len = Number(bits);
    if (b == null || !(len >= 0 && len <= 32)) return false;
    const mask = len === 0 ? 0 : (~0 << (32 - len)) >>> 0;
    return ((n & mask) >>> 0) === ((b & mask) >>> 0);
  }
  if (r.includes('-')) {
    const [a, z] = r.split('-').map(ipNum);
    return a != null && z != null && n >= a && n <= z;
  }
  return ipNum(r) === n;
}
export const isIp = ip => ipNum(ip) != null;
export function firstRange(ip, ranges) { return list(ranges).find(r => ipInRange(ip, r)) || null; }

// "730.00:00:00" (a TimeSpan) or a number of days.
function daysOf(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v;
  const m = /^(\d+)(?:\.\d\d:\d\d:\d\d)?$/.exec(str(v).trim());
  return m ? Number(m[1]) : null;
}
function durationWords(days) {
  if (days == null) return 'forever';
  if (days % 365 === 0) return `${days / 365} year${days === 365 ? '' : 's'}`;
  if (days === 2555) return '7 years';
  return `${days} days`;
}

// ---------------------------------------------------------------------------------------------------------------
// Sensitive information types NextHop can recognise in the subject, body and attachment names.
// Real Purview types also weigh supporting keywords and confidence; this is the pattern part only, and the step
// says so. A rule that names a type not listed here is reported as "cannot predict", never as "no match".
// ---------------------------------------------------------------------------------------------------------------
function luhn(digits) {
  let sum = 0; let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (alt) { d *= 2; if (d > 9) d -= 9; }
    sum += d; alt = !alt;
  }
  return sum % 10 === 0;
}
function ibanOk(s) {
  const t = s.replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(t)) return false;
  const moved = (t.slice(4) + t.slice(0, 4)).replace(/[A-Z]/g, c => String(c.charCodeAt(0) - 55));
  let rem = 0;
  for (const ch of moved) rem = (rem * 10 + Number(ch)) % 97;
  return rem === 1;
}
function abaOk(d) {
  const n = d.split('').map(Number);
  return (3 * (n[0] + n[3] + n[6]) + 7 * (n[1] + n[4] + n[7]) + (n[2] + n[5] + n[8])) % 10 === 0;
}
export const SIT_DETECTORS = [
  { name: 'Credit Card Number', ids: ['50842eb7-edc8-4019-85dd-5a5c1f2bb085'], count: t => (t.match(/\b(?:\d[ -]?){12,18}\d\b/g) || []).map(x => x.replace(/\D/g, '')).filter(d => d.length >= 13 && d.length <= 19 && luhn(d)).length, how: '13 to 19 digits that pass the Luhn check' },
  { name: 'U.S. Social Security Number (SSN)', ids: ['a44669fe-0d48-453d-a9b1-2cc83f2cba77'], count: t => (t.match(/\b\d{3}-\d{2}-\d{4}\b/g) || []).filter(x => !/^(000|666|9\d\d)-|-00-|-0000$/.test(x)).length, how: 'nnn-nn-nnnn, not starting 000, 666 or 9' },
  { name: 'International Banking Account Number (IBAN)', ids: [], count: t => (t.match(/\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,4})?\b/g) || []).filter(ibanOk).length, how: 'a country code, check digits and account that pass the IBAN mod-97 check' },
  { name: 'ABA Routing Number', ids: [], count: t => (/\b(routing|aba|rtn)\b/i.test(t) ? (t.match(/\b\d{9}\b/g) || []).filter(abaOk).length : 0), how: '9 digits that pass the ABA checksum, with the word routing, ABA or RTN nearby' },
  { name: 'U.S. Individual Taxpayer Identification Number (ITIN)', ids: [], count: t => (t.match(/\b9\d{2}-[78]\d-\d{4}\b/g) || []).length, how: '9nn-7n-nnnn or 9nn-8n-nnnn' },
  { name: 'U.K. National Insurance Number (NINO)', ids: [], count: t => (t.match(/\b[A-CEGHJ-PR-TW-Z]{2} ?\d{2} ?\d{2} ?\d{2} ?[A-D]\b/g) || []).length, how: 'two letters, six digits and a letter A to D' },
];

// Every way an export can name a sensitive information type inside a rule, flattened to [{ name, id, minCount }].
export function sitRefs(value) {
  const out = [];
  const add = (o) => {
    if (o == null) return;
    if (typeof o === 'string') {
      const s = o.trim();
      if (!s) return;
      if (/^[[{]/.test(s)) { try { add(JSON.parse(s)); return; } catch { /* not JSON */ } }
      const name = /(?:^|[{;|,\s])name\s*[=:]\s*"?([^;|}"]+)"?/i.exec(s)?.[1];
      const min = /mincount\s*[=:]\s*"?(\d+)/i.exec(s)?.[1];
      const id = /(?:^|[{;|,\s])id\s*[=:]\s*"?([0-9a-f-]{36})/i.exec(s)?.[1];
      out.push({ name: (name || (/^[0-9a-f-]{36}$/i.test(s) ? '' : s)).trim(), id: id || (/^[0-9a-f-]{36}$/i.test(s) ? s : ''), minCount: Number(min || 1) });
      return;
    }
    if (Array.isArray(o)) { o.forEach(add); return; }
    if (typeof o === 'object') {
      const kids = o.sensitivetypes || o.SensitiveTypes || o.groups || o.Groups;
      if (kids) { add(kids); return; }
      const name = o.name ?? o.Name ?? '';
      const id = o.id ?? o.Id ?? '';
      if (name || id) out.push({ name: str(name), id: str(id), minCount: Number(o.mincount ?? o.minCount ?? o.MinCount ?? 1) || 1 });
    }
  };
  add(value);
  return out;
}
function detectorFor(ref, cfg) {
  let name = ref.name;
  if (!name && ref.id) name = items(cfg, 'dlpSensitiveInformationTypes').find(t => lc(t.Id) === lc(ref.id))?.Name || '';
  return SIT_DETECTORS.find(d => lc(d.name) === lc(name) || d.ids.includes(lc(ref.id))) || null;
}
// { matched: [{ name, count, minCount }], unknown: [names] }. Any one matching type is enough (Or), like the default rule group.
export function matchSits(refs, text, cfg) {
  const matched = []; const unknown = [];
  for (const ref of refs) {
    const det = detectorFor(ref, cfg);
    if (!det) { unknown.push(ref.name || ref.id || '(unnamed type)'); continue; }
    const count = det.count(text);
    if (count >= (ref.minCount || 1)) matched.push({ name: det.name, count, minCount: ref.minCount || 1 });
  }
  return { matched, unknown };
}

// ---------------------------------------------------------------------------------------------------------------
// The organisation as NextHop sees it.
// ---------------------------------------------------------------------------------------------------------------
export function orgOf(cfg) {
  const domains = items(cfg, 'acceptedDomains').map(d => ({ name: lc(d.DomainName || d.Name), type: str(d.DomainType || 'Authoritative'), isDefault: bool(d.Default), raw: d }));
  const box = items(cfg, 'mailbox')[0] || null;
  const primary = addressOf(box?.PrimarySmtpAddress) || addressOf(box?.WindowsEmailAddress) || lc(cfg?.mailbox?.address);
  const addresses = [...new Set([primary, ...list(box?.EmailAddresses).filter(a => /^smtp:/i.test(str(a))).map(addressOf)].filter(Boolean))];
  const memberOf = items(cfg, 'mailboxMemberOf').map(g => ({ name: str(g.DisplayName || g.Name), keys: [g.DisplayName, g.Name, g.Alias, g.PrimarySmtpAddress, g.Identity, g.DistinguishedName, g.ExternalDirectoryObjectId, g.Guid].filter(Boolean).map(lc), raw: g }));
  const user = items(cfg, 'mailboxUser')[0] || null;
  return {
    name: str(cfg?.tenant?.organization || items(cfg, 'organizationConfig')[0]?.Name || ''),
    domains,
    isAccepted: d => domains.some(x => x.name === lc(d)),
    acceptedType: d => domains.find(x => x.name === lc(d))?.type || null,
    mailbox: { raw: box, primary, addresses, displayName: str(box?.DisplayName || user?.DisplayName || primary), memberOf, user },
  };
}

// Does a list of people (addresses, names, groups) name this party? Groups match only the export's mailbox,
// through its direct memberships; an outside address is never in a group.
function partyKeys(party) { return [party.address, ...(party.addresses || []), party.displayName, party.alias].filter(Boolean).map(lc); }
function namesParty(refs, party) {
  const keys = partyKeys(party);
  return list(refs).find(r => { const a = addressOf(r); const k = lc(r); return (a && keys.includes(a)) || keys.includes(k); }) || null;
}
function memberOfAny(refs, party) {
  if (!party.internal) return null;
  for (const r of list(refs)) {
    const k = lc(r); const a = addressOf(r);
    const g = party.memberOf.find(m => m.keys.includes(k) || (a && m.keys.includes(a)));
    if (g) return g.name || str(r);
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------------
// Picking the protection policy that applies to one person: Strict preset, then Standard preset, then custom
// policies by rule priority, then the default (or Built-in protection for Safe Links and Safe Attachments).
// ---------------------------------------------------------------------------------------------------------------
const RECIPIENT_CONDITIONS = { SentTo: 'is', SentToMemberOf: 'member', RecipientDomainIs: 'domain' };
const SENDER_CONDITIONS = { From: 'is', FromMemberOf: 'member', SenderDomainIs: 'domain' };
function scopeTest(rule, party, conditions) {
  const has = Object.keys(conditions).filter(k => nonEmpty(rule[k]));
  const hit = k => (conditions[k] === 'is' ? namesParty(rule[k], party) : conditions[k] === 'member' ? memberOfAny(rule[k], party) : list(rule[k]).find(d => (party.addresses || [party.address]).some(a => domainOf(a) === lc(d))) || null);
  for (const k of has) if (!hit(k)) return { applies: false, why: `${k} is ${list(rule[k]).join(', ')}` };
  for (const k of Object.keys(conditions)) {
    const ex = `ExceptIf${k}`;
    if (!nonEmpty(rule[ex])) continue;
    const v = conditions[k] === 'is' ? namesParty(rule[ex], party) : conditions[k] === 'member' ? memberOfAny(rule[ex], party) : list(rule[ex]).find(d => (party.addresses || [party.address]).some(a => domainOf(a) === lc(d))) || null;
    if (v) return { applies: false, why: `excepted by ${ex} ${v}` };
  }
  const why = has.length ? has.map(k => `${k} ${list(rule[k]).join(', ')}`).join(' and ') : 'no conditions (everyone)';
  return { applies: true, why };
}
const enabledRule = r => !/disabled/i.test(str(r.State)) && r.Enabled !== false && r.Enabled !== 'False';
const isPresetPolicy = (p, level) => lc(p.RecommendedPolicyType) === lc(level) || lc(p.Name || p.Identity).startsWith(`${lc(level)} preset security policy`);
const isDefaultPolicy = p => bool(p.IsDefault) || /^(default|office365 antiphish default)/i.test(str(p.Name || p.Identity));

export function pickPolicy(cfg, { policies, rules, policyKey, presetRules = 'presetEopRules', builtIn = false, party, direction = 'recipient' }) {
  const all = items(cfg, policies);
  const conditions = direction === 'sender' ? SENDER_CONDITIONS : RECIPIENT_CONDITIONS;
  for (const level of presetRules ? ['Strict', 'Standard'] : []) {
    const pr = items(cfg, presetRules).find(r => new RegExp(`^${level}`, 'i').test(str(r.Identity || r.Name)) && enabledRule(r));
    if (!pr) continue;
    const t = scopeTest(pr, party, conditions);
    if (!t.applies) continue;
    const pol = all.find(p => lc(p.Name || p.Identity) === lc(pr[policyKey])) || all.find(p => isPresetPolicy(p, level));
    return { policy: pol || { Name: `${level} Preset Security Policy` }, via: `${level} preset security policy (${t.why})`, rule: pr, preset: level };
  }
  const custom = items(cfg, rules).filter(enabledRule).sort((a, b) => Number(a.Priority ?? 99) - Number(b.Priority ?? 99));
  for (const r of custom) {
    const t = scopeTest(r, party, conditions);
    if (!t.applies) continue;
    const pol = all.find(p => lc(p.Name || p.Identity) === lc(r[policyKey]));
    if (pol) return { policy: pol, via: `rule "${r.Name}" at priority ${r.Priority ?? '?'} (${t.why})`, rule: r };
  }
  if (builtIn) {
    const b = all.find(p => bool(p.IsBuiltInProtection) || /built-?in protection/i.test(str(p.Name)));
    const br = items(cfg, 'builtInProtectionRule')[0];
    if (b || br) return { policy: b || { Name: 'Built-In Protection Policy' }, via: 'Built-in protection, because no other policy covers this person', rule: br, builtIn: true };
    return { policy: null, via: 'no policy covers this person' };
  }
  const def = all.find(isDefaultPolicy);
  return { policy: def || null, via: def ? 'the default policy, because no other policy covers this person' : 'no policy found in the export' };
}

// ---------------------------------------------------------------------------------------------------------------
// The test message.
// ---------------------------------------------------------------------------------------------------------------
export const VERDICTS = {
  clean: 'Not spam',
  spam: 'Spam',
  hcspam: 'High confidence spam',
  phish: 'Phishing',
  hcphish: 'High confidence phishing',
  bulk: 'Bulk mail',
};
export const AUTH_RESULTS = {
  pass: 'Passes SPF, DKIM and DMARC',
  'dmarc-reject': 'Fails DMARC; the sender\'s domain publishes p=reject',
  'dmarc-quarantine': 'Fails DMARC; the sender\'s domain publishes p=quarantine',
  'dmarc-none': 'Fails DMARC; the sender\'s domain publishes p=none',
  'composite-fail': 'Fails composite authentication (spoofed; the domain has no DMARC record)',
};
export const MESSAGE_KINDS = { normal: 'A normal message', autoforward: 'An automatic forward (from an inbox rule or mailbox forwarding)', autoreply: 'An automatic reply (out of office)' };

export function parseAttachments(text) {
  return str(text).split(/[\n,;]+/).map(s => s.trim()).filter(Boolean).map(s => {
    const m = /^(.*?)(?:\s+\(?([\d.]+)\s*(KB|MB|GB|B)\)?)?$/i.exec(s);
    const name = (m?.[1] || s).trim();
    const sizeBytes = m?.[2] ? bytesOf(`${m[2]} ${m[3]}`) : 50 * 1024;
    return { name, ext: name.includes('.') ? name.split('.').pop().toLowerCase() : '', sizeBytes };
  });
}

const EXECUTABLE = new Set(['exe', 'com', 'scr', 'bat', 'cmd', 'pif', 'msi', 'dll', 'js', 'jse', 'vbs', 'vbe', 'wsf', 'wsh', 'ps1', 'jar', 'hta', 'cpl', 'lnk', 'reg', 'app', 'msc']);

export function normalizeMessage(cfg, input = {}) {
  const org = orgOf(cfg);
  const direction = input.direction === 'outbound' ? 'outbound' : 'inbound';
  const externalAddress = addressOf(input.externalAddress) || 'someone@outside.example';
  const internal = { internal: true, address: org.mailbox.primary, addresses: org.mailbox.addresses, displayName: org.mailbox.displayName, memberOf: org.mailbox.memberOf, user: org.mailbox.user };
  const external = { internal: false, address: externalAddress, addresses: [externalAddress], displayName: str(input.fromName).trim() || externalAddress, memberOf: [] };
  if (direction === 'outbound') external.displayName = externalAddress;
  const attachments = Array.isArray(input.attachments) ? input.attachments : parseAttachments(input.attachments);
  const bodyBytes = new TextEncoder().encode(`${input.subject || ''}\n${input.body || ''}`).length;
  const sizeBytes = Number(input.sizeBytes) > 0 ? Number(input.sizeBytes) : bodyBytes + 2048 + attachments.reduce((n, a) => n + Math.round((a.sizeBytes || 0) * 1.37), 0);
  return {
    direction,
    kind: MESSAGE_KINDS[input.kind] ? input.kind : 'normal',
    from: direction === 'inbound' ? external : internal,
    to: direction === 'inbound' ? internal : external,
    internal, external,
    ip: direction === 'inbound' ? str(input.ip).trim() : '',
    subject: str(input.subject),
    body: str(input.body),
    attachments,
    sizeBytes,
    auth: AUTH_RESULTS[input.auth] ? input.auth : 'pass',
    verdict: VERDICTS[input.verdict] ? input.verdict : 'clean',
    bcl: Number.isFinite(Number(input.bcl)) && input.bcl !== '' ? Math.max(0, Math.min(9, Number(input.bcl))) : (input.verdict === 'bulk' ? 7 : 0),
    malware: bool(input.malware),
    label: str(input.label).trim(),
    headers: {},
  };
}

const textOf = msg => `${msg.subject}\n${msg.body}\n${msg.attachments.map(a => a.name).join('\n')}`;
const urlsOf = msg => [...new Set((`${msg.subject}\n${msg.body}`.match(/\bhttps?:\/\/[^\s<>"')]+/gi) || []))];

// ---------------------------------------------------------------------------------------------------------------
// Mail flow rule (transport rule) conditions. Each test returns a reason string when it matches, null when not.
// UNSUPPORTED conditions make the rule "cannot predict": NextHop says so instead of guessing.
// ---------------------------------------------------------------------------------------------------------------
function inOrg(party, org) { return party.internal || org.isAccepted(domainOf(party.address)); }
function isPartnerDomain(cfg, domain) {
  return items(cfg, 'outboundConnectors').some(c => enabledRule(c) && /partner/i.test(str(c.ConnectorType)) && list(c.RecipientDomains).some(p => domainMatches(domain, p)))
    || items(cfg, 'inboundConnectors').some(c => enabledRule(c) && /partner/i.test(str(c.ConnectorType)) && list(c.SenderDomains).some(p => p !== 'smtp:*;1' && domainMatches(domain, p)));
}
function scopeOf(scope, party, org, cfg) {
  const s = lc(scope);
  const inside = inOrg(party, org);
  if (s === 'inorganization') return inside;
  if (s === 'notinorganization') return !inside;
  if (s === 'externalpartner') return !inside && isPartnerDomain(cfg, domainOf(party.address));
  if (s === 'externalnonpartner') return !inside && !isPartnerDomain(cfg, domainOf(party.address));
  return false;
}
function adAttributeHit(user, pairs) {
  if (!user) return null;
  for (const pair of list(pairs)) {
    const [attr, words] = str(pair).split(':');
    if (!attr || words == null) continue;
    const value = str(user[attr.trim()] ?? user[attr.trim().replace(/^./, c => c.toUpperCase())]);
    const w = words.split(',').map(x => x.trim()).find(x => x && containsWord(value, x));
    if (w) return `${attr.trim()} contains "${w}"`;
  }
  return null;
}
const KIND_TYPES = { autoforward: 'autoforward', autoreply: 'oof' };

function ruleConditionTests(cfg, org, msg) {
  const all = textOf(msg);
  const subjBody = `${msg.subject}\n${msg.body}`;
  const att = msg.attachments;
  return {
    FromScope: v => (scopeOf(v, msg.from, org, cfg) ? `the sender is ${lc(v) === 'inorganization' ? 'inside' : 'outside'} the organization` : null),
    SentToScope: v => (scopeOf(v, msg.to, org, cfg) ? `the recipient is ${{ inorganization: 'inside the organization', notinorganization: 'outside the organization', externalpartner: 'at a partner domain', externalnonpartner: 'outside and not a partner' }[lc(v)] || v}` : null),
    From: v => (namesParty(v, msg.from) ? `the sender is ${namesParty(v, msg.from)}` : null),
    FromMemberOf: v => { const g = memberOfAny(v, msg.from); return g ? `the sender is a member of ${g}` : null; },
    SentTo: v => (namesParty(v, msg.to) ? `the recipient is ${namesParty(v, msg.to)}` : null),
    SentToMemberOf: v => { const g = memberOfAny(v, msg.to); return g ? `the recipient is a member of ${g}` : null; },
    AnyOfToHeader: v => (namesParty(v, msg.to) ? `To has ${namesParty(v, msg.to)}` : null),
    AnyOfToCcHeader: v => (namesParty(v, msg.to) ? `To or Cc has ${namesParty(v, msg.to)}` : null),
    AnyOfToHeaderMemberOf: v => { const g = memberOfAny(v, msg.to); return g ? `To has a member of ${g}` : null; },
    AnyOfToCcHeaderMemberOf: v => { const g = memberOfAny(v, msg.to); return g ? `To or Cc has a member of ${g}` : null; },
    SenderDomainIs: v => { const d = list(v).find(x => domainMatches(domainOf(msg.from.address), x)); return d ? `the sender's domain is ${d}` : null; },
    RecipientDomainIs: v => { const d = list(v).find(x => domainMatches(domainOf(msg.to.address), x)); return d ? `the recipient's domain is ${d}` : null; },
    FromAddressContainsWords: v => { const w = firstWord(msg.from.address.replace(/[@.]/g, ' '), v) || list(v).find(x => msg.from.address.includes(lc(x))); return w ? `the sender address contains "${w}"` : null; },
    FromAddressMatchesPatterns: v => { const p = firstPattern(msg.from.address, v); return p ? `the sender address matches ${p}` : null; },
    RecipientAddressContainsWords: v => { const w = list(v).find(x => msg.to.address.includes(lc(x))); return w ? `the recipient address contains "${w}"` : null; },
    AnyOfRecipientAddressContainsWords: v => { const w = list(v).find(x => msg.to.address.includes(lc(x))); return w ? `a recipient address contains "${w}"` : null; },
    RecipientAddressMatchesPatterns: v => { const p = firstPattern(msg.to.address, v); return p ? `the recipient address matches ${p}` : null; },
    AnyOfRecipientAddressMatchesPatterns: v => { const p = firstPattern(msg.to.address, v); return p ? `a recipient address matches ${p}` : null; },
    SubjectContainsWords: v => { const w = firstWord(msg.subject, v); return w ? `the subject contains "${w}"` : null; },
    SubjectMatchesPatterns: v => { const p = firstPattern(msg.subject, v); return p ? `the subject matches ${p}` : null; },
    SubjectOrBodyContainsWords: v => { const w = firstWord(subjBody, v); return w ? `the subject or body contains "${w}"` : null; },
    SubjectOrBodyMatchesPatterns: v => { const p = firstPattern(subjBody, v); return p ? `the subject or body matches ${p}` : null; },
    AttachmentExtensionMatchesWords: v => { const a = att.find(x => list(v).map(lc).map(e => e.replace(/^\./, '')).includes(x.ext)); return a ? `attachment ${a.name} has the extension .${a.ext}` : null; },
    AttachmentNameMatchesPatterns: v => { const a = att.find(x => firstPattern(x.name, v)); return a ? `attachment name ${a.name} matches ${firstPattern(a.name, v)}` : null; },
    AttachmentHasExecutableContent: v => { if (!bool(v)) return null; const a = att.find(x => EXECUTABLE.has(x.ext)); return a ? `attachment ${a.name} is executable (judged by its extension)` : null; },
    AttachmentSizeOver: v => { const lim = bytesOf(v); const a = att.find(x => lim != null && x.sizeBytes > lim); return a ? `attachment ${a.name} (${sizeText(a.sizeBytes)}) is over ${sizeText(lim)}` : null; },
    MessageSizeOver: v => { const lim = bytesOf(v); return lim != null && msg.sizeBytes > lim ? `the message (${sizeText(msg.sizeBytes)}) is over ${sizeText(lim)}` : null; },
    SenderIpRanges: v => { const r = msg.ip ? firstRange(msg.ip, v) : null; return r ? `the sending IP ${msg.ip} is in ${r}` : null; },
    MessageContainsDataClassifications: v => { const m = matchSits(sitRefs(v), all, cfg); return m.matched.length ? `the message contains ${m.matched.map(x => `${x.name} (${x.count} found)`).join(', ')}` : null; },
    SCLOver: v => (msg.scl != null && Number(msg.scl) >= Number(v) ? `the spam confidence level ${msg.scl} is ${v} or higher` : null),
    HeaderContainsMessageHeader: (v, rule) => { const h = msg.headers[lc(v)]; const w = h != null ? firstWord(h, rule.HeaderContainsWords) : null; return w ? `header ${v} contains "${w}"` : null; },
    HeaderMatchesMessageHeader: (v, rule) => { const h = msg.headers[lc(v)]; const p = h != null ? firstPattern(h, rule.HeaderMatchesPatterns) : null; return p ? `header ${v} matches ${p}` : null; },
    SenderADAttributeContainsWords: v => (msg.from.internal ? adAttributeHit(msg.from.user, v) : null),
    RecipientADAttributeContainsWords: v => (msg.to.internal ? adAttributeHit(msg.to.user, v) : null),
    MessageTypeMatches: v => (KIND_TYPES[msg.kind] && lc(v) === KIND_TYPES[msg.kind] ? `the message type is ${v}` : null),
    WithImportance: v => (lc(v) === 'normal' ? 'the importance is Normal' : null),
  };
}
// Conditions that need the message's content or the directory in ways configuration cannot show.
export const UNSUPPORTED_CONDITIONS = ['AttachmentContainsWords', 'AttachmentMatchesPatterns', 'AttachmentPropertyContainsWords', 'AttachmentIsPasswordProtected', 'AttachmentIsUnsupported', 'AttachmentProcessingLimitExceeded', 'ContentCharacterSetContainsWords', 'HasClassification', 'HasNoClassification', 'HasSenderOverride', 'ManagerAddresses', 'ADComparisonAttribute', 'SenderManagementRelationship', 'SenderInRecipientList', 'RecipientInSenderList', 'AnyOfCcHeader', 'AnyOfCcHeaderMemberOf', 'BetweenMemberOf1'];

function evalConditions(rule, tests, prefix = '') {
  const reasons = []; const unsupported = []; let failed = null;
  for (const [key, test] of Object.entries(tests)) {
    const v = rule[prefix + key];
    if (!nonEmpty(v) || v === false || v === 'False') continue;
    const r = test(v, rule);
    if (r) reasons.push(r); else if (!failed) failed = `${prefix}${key} (${list(v).slice(0, 4).join(', ')}${list(v).length > 4 ? ', …' : ''})`;
  }
  for (const key of UNSUPPORTED_CONDITIONS) if (nonEmpty(rule[prefix + key]) && rule[prefix + key] !== false && rule[prefix + key] !== 'False') unsupported.push(prefix + key);
  return { reasons, unsupported, failed, any: reasons.length > 0 };
}

// ---------------------------------------------------------------------------------------------------------------
// The prediction.
// ---------------------------------------------------------------------------------------------------------------
const QUARANTINE_WORDS = {
  adminonlyaccesspolicy: 'only admins can release it, and the recipient is not told',
  defaultfullaccesspolicy: 'the recipient can release it themselves, without a notification',
  defaultfullaccesswithnotificationpolicy: 'the recipient can release it and gets a quarantine notification',
  notificationenabledpolicy: 'the recipient gets a notification and can release it',
};
function quarantineWords(cfg, tag) {
  const t = lc(tag || 'AdminOnlyAccessPolicy');
  const pol = items(cfg, 'quarantinePolicies').find(q => lc(q.Name || q.Identity) === t);
  if (QUARANTINE_WORDS[t]) return { name: tag || 'AdminOnlyAccessPolicy', words: QUARANTINE_WORDS[t], obj: pol };
  if (pol) {
    const perms = str(pol.EndUserQuarantinePermissions);
    const release = /PermissionToRelease:\s*True/i.test(perms) ? 'the recipient can release it' : /PermissionToRequestRelease:\s*True/i.test(perms) ? 'the recipient can ask an admin to release it' : 'only admins can release it';
    return { name: pol.Name, words: `${release}${bool(pol.ESNEnabled) ? ', and gets a quarantine notification' : ''}`, obj: pol };
  }
  return { name: tag, words: 'the export does not include this quarantine policy, so who can release it is unknown', obj: null };
}

const ACTION_WORDS = {
  movetojmf: 'moved to the Junk Email folder', addxheader: 'delivered with an X-header added', modifysubject: 'delivered with the subject changed',
  redirect: 'redirected to another address', delete: 'deleted silently', quarantine: 'quarantined', noaction: 'delivered with no action',
  reject: 'rejected with a bounce (NDR) to the sender',
};

export function predict(cfg, input) {
  const org = orgOf(cfg);
  const msg = normalizeMessage(cfg, input);
  const steps = [];
  const unknowns = [];
  const copies = [];
  const notes = [];
  const fate = { done: false, outcome: '', tone: 'ok', where: 'Inbox', encrypted: false, ndr: '' };
  const add = (component, text, tone = 'info', settings = [], extra = {}) => { steps.push({ component, text, tone, settings, ...extra }); return steps[steps.length - 1]; };
  const set = (kind, name, property, value, section) => ({ kind, name: str(name), property, value: Array.isArray(value) ? value.join(', ') : str(value), section });
  const end = (outcome, tone, extra = {}) => { Object.assign(fate, { done: true, outcome, tone, ...extra }); };
  const read = name => sectionStatus(cfg, name);
  const missing = (name, what) => { const st = read(name); if (st !== 'ok' && st !== 'empty') { unknowns.push(`${what}: the export's ${name} section is "${st}"${cfg?.sections?.[name]?.error?.message ? ` (${cfg.sections[name].error.message})` : ''}, so NextHop treated it as not configured.`); return true; } return false; };
  const bypass = { spam: false, all: false, why: [] };
  msg.scl = null;

  if (!org.mailbox.primary) {
    add('NextHop', 'The configuration has no mailbox, so there is nobody to send from or deliver to. Open an export that includes the mailbox section.', 'high');
    return finish();
  }

  if (msg.direction === 'inbound') inbound(); else outbound();
  return finish();

  // -------------------------------------------------------------------------------------------------------------
  function inbound() {
    const ext = msg.external; const box = msg.internal; const extDomain = domainOf(ext.address);
    add('The Internet', `${ext.displayName !== ext.address ? `"${ext.displayName}" <${ext.address}>` : ext.address} sends to ${box.address} from IP ${msg.ip || '(no IP given)'}. NextHop does not look up DNS: the sender's MX, SPF, DKIM and DMARC are what you chose (${AUTH_RESULTS[msg.auth]}).`, 'info');

    // Accepted domain
    const rDomain = domainOf(box.address);
    if (!org.isAccepted(rDomain) && !missing('acceptedDomains', 'Accepted domains')) {
      add('Exchange Online front door', `${rDomain} is not an accepted domain, so Exchange Online refuses the message at the door (550 5.4.1 Recipient address rejected: Access denied).`, 'high', [set('domain', rDomain, 'Accepted domain', 'not listed', 'acceptedDomains')]);
      return end('Rejected at the door (550 5.4.1)', 'high', { ndr: '550 5.4.1' });
    }
    add('Exchange Online front door', `${rDomain} is an accepted domain (${org.acceptedType(rDomain) || 'Authoritative'}), so Exchange Online accepts mail for it.`, 'ok', [set('domain', rDomain, 'DomainType', org.acceptedType(rDomain) || 'Authoritative', 'acceptedDomains')]);

    // Inbound connectors
    missing('inboundConnectors', 'Inbound connectors');
    const conns = items(cfg, 'inboundConnectors').filter(enabledRule);
    const byIp = conns.find(c => msg.ip && firstRange(msg.ip, c.SenderIPAddresses));
    const byDomain = conns.find(c => list(c.SenderDomains).some(d => connectorDomain(d) !== '*' && domainMatches(extDomain, d)));
    const conn = byIp || byDomain;
    if (conn) {
      const bits = [];
      if (byIp === conn) bits.push(`the IP ${msg.ip} is in its sender IP addresses`);
      if (byDomain === conn) bits.push(`${extDomain} is in its sender domains`);
      add('Inbound connector', `Matched "${conn.Name}" (${conn.ConnectorType || 'Partner'}) because ${bits.join(' and ')}.${bool(conn.RequireTls) ? ' It requires TLS; NextHop assumes the sender uses it.' : ''}`, 'info', [set('connector', conn.Name, byIp === conn ? 'SenderIPAddresses' : 'SenderDomains', byIp === conn ? conn.SenderIPAddresses : conn.SenderDomains, 'inboundConnectors')], { objects: [{ kind: 'connector', name: conn.Name }] });
      if (byDomain === conn && bool(conn.RestrictDomainsToIPAddresses) && !(msg.ip && firstRange(msg.ip, conn.SenderIPAddresses))) {
        add('Inbound connector', `"${conn.Name}" only accepts ${extDomain} from ${list(conn.SenderIPAddresses).join(', ') || 'its listed IPs'}, and ${msg.ip || 'this message'} is not one of them. Exchange Online rejects it (550 5.7.51 TenantInboundAttribution; Rejecting based on IP).`, 'high', [set('connector', conn.Name, 'RestrictDomainsToIPAddresses', 'True', 'inboundConnectors'), set('connector', conn.Name, 'SenderIPAddresses', conn.SenderIPAddresses, 'inboundConnectors')]);
        return end('Rejected by the inbound connector (550 5.7.51)', 'high', { ndr: '550 5.7.51' });
      }
      if (list(conn.EFSkipIPs).length || bool(conn.EFSkipLastIP)) add('Enhanced filtering', `"${conn.Name}" has enhanced filtering for connectors on, so filtering looks past the listed hops to the real source.`, 'info', [set('connector', conn.Name, 'EFSkipIPs', conn.EFSkipIPs, 'inboundConnectors')]);
    } else add('Inbound connector', `No inbound connector matches ${extDomain}${msg.ip ? ` or ${msg.ip}` : ''}, so the message arrives as ordinary Internet mail.`, 'ok');

    // Mailbox can receive at all?
    const mbx = org.mailbox.raw || {};
    if (bool(mbx.RequireSenderAuthenticationEnabled)) {
      add('Recipient', `${box.address} only accepts mail from inside the organization ("Require that all senders are authenticated" is on). Exchange Online rejects this outside sender (550 5.7.133 RESOLVER.RST.SenderNotAuthenticatedForGroup).`, 'high', [set('mailbox', box.address, 'RequireSenderAuthenticationEnabled', 'True', 'mailbox')], { objects: [{ kind: 'mailbox', name: box.address }] });
      return end('Rejected: the mailbox accepts internal senders only (550 5.7.133)', 'high', { ndr: '550 5.7.133' });
    }
    if (nonEmpty(mbx.RejectMessagesFrom) && namesParty(mbx.RejectMessagesFrom, ext)) {
      add('Recipient', `${box.address} rejects mail from ${ext.address} (delivery restriction).`, 'high', [set('mailbox', box.address, 'RejectMessagesFrom', mbx.RejectMessagesFrom, 'mailbox')]);
      return end('Rejected by a delivery restriction on the mailbox (550 5.7.1)', 'high', { ndr: '550 5.7.1' });
    }
    if (nonEmpty(mbx.AcceptMessagesOnlyFrom) && !namesParty(mbx.AcceptMessagesOnlyFrom, ext)) {
      add('Recipient', `${box.address} accepts mail only from ${list(mbx.AcceptMessagesOnlyFrom).join(', ')}, and ${ext.address} is not one of them.`, 'high', [set('mailbox', box.address, 'AcceptMessagesOnlyFrom', mbx.AcceptMessagesOnlyFrom, 'mailbox')]);
      return end('Rejected by a delivery restriction on the mailbox (550 5.7.1)', 'high', { ndr: '550 5.7.1' });
    }
    if (sizeCheck('receive')) return undefined;

    // Advanced delivery
    const sim = items(cfg, 'phishSimOverrideRules').find(r => enabledRule(r) && list(r.Domains).some(d => domainMatches(extDomain, d)) && msg.ip && firstRange(msg.ip, r.SenderIpRanges));
    const secops = items(cfg, 'secOpsOverrideRules').length && items(cfg, 'secOpsOverridePolicy').some(p => list(p.SentTo).map(lc).some(a => box.addresses.includes(a)));
    if (sim) {
      bypass.all = true; bypass.why.push('advanced delivery (phishing simulation)');
      add('Advanced delivery', `${extDomain} from ${msg.ip} is a third-party phishing simulation, so Exchange Online delivers it without filtering it (no spam, phish or Safe Links verdicts).`, 'medium', [set('advancedDelivery', sim.Name || 'Phishing simulation', 'Domains / SenderIpRanges', `${list(sim.Domains).join(', ')} / ${list(sim.SenderIpRanges).join(', ')}`, 'phishSimOverrideRules')], { objects: [{ kind: 'advancedDelivery', name: sim.Name || 'Phishing simulation' }] });
    }
    if (secops) {
      bypass.all = true; bypass.why.push('advanced delivery (SecOps mailbox)');
      add('Advanced delivery', `${box.address} is a SecOps mailbox, so Exchange Online delivers mail to it unfiltered.`, 'medium', [set('advancedDelivery', 'SecOps mailboxes', 'SentTo', box.address, 'secOpsOverridePolicy')], { objects: [{ kind: 'advancedDelivery', name: 'SecOps mailboxes' }] });
    }

    // Connection filter and Tenant Allow/Block List: IP
    missing('connectionFilterPolicies', 'Connection filter');
    const cf = items(cfg, 'connectionFilterPolicies')[0];
    const tablIp = items(cfg, 'tenantAllowBlockIPs').find(i => msg.ip && ipInRange(msg.ip, i.Value));
    if (msg.ip && cf) {
      const blocked = firstRange(msg.ip, cf.IPBlockList);
      const allowed = firstRange(msg.ip, cf.IPAllowList);
      if (allowed) {
        bypass.spam = true; bypass.why.push('the connection filter IP Allow List');
        add('Connection filter', `${msg.ip} is on the IP Allow List (${allowed}), so spam filtering is skipped. Malware filtering and high-confidence phishing still apply.`, 'medium', [set('connectionFilter', cf.Name || 'Default', 'IPAllowList', allowed, 'connectionFilterPolicies')], { objects: [{ kind: 'connectionFilter', name: cf.Name || 'Default' }] });
      } else if (blocked && !bypass.all) {
        add('Connection filter', `${msg.ip} is on the IP Block List (${blocked}). Exchange Online drops the connection and the message never arrives (the sender sees 550 5.7.1 or a timeout).`, 'high', [set('connectionFilter', cf.Name || 'Default', 'IPBlockList', blocked, 'connectionFilterPolicies')], { objects: [{ kind: 'connectionFilter', name: cf.Name || 'Default' }] });
        return end('Blocked by the connection filter (IP Block List)', 'high', { ndr: '550 5.7.1' });
      } else add('Connection filter', `${msg.ip} is on neither the IP Allow List nor the IP Block List. NextHop does not know Microsoft's own IP reputation lists, so it assumes the IP is not on them.`, 'ok', [set('connectionFilter', cf.Name || 'Default', 'IPAllowList / IPBlockList', `${list(cf.IPAllowList).length} / ${list(cf.IPBlockList).length} entries`, 'connectionFilterPolicies')], { objects: [{ kind: 'connectionFilter', name: cf.Name || 'Default' }] });
    } else if (!msg.ip) add('Connection filter', 'No sending IP was given, so the IP Allow and Block Lists and IP-based rules were not checked.', 'medium');
    if (tablIp && /block/i.test(str(tablIp.Action)) && !bypass.all) {
      add('Tenant Allow/Block List', `${msg.ip} is blocked in the Tenant Allow/Block List (${tablIp.Value}). Exchange Online rejects it.`, 'high', [set('tenantAllowBlock', tablIp.Value, 'Action', tablIp.Action, 'tenantAllowBlockIPs')], { objects: [{ kind: 'tenantAllowBlock', name: tablIp.Value }] });
      return end('Blocked by the Tenant Allow/Block List (IP)', 'high', { ndr: '550 5.7.1' });
    }

    // Tenant Allow/Block List: sender
    const tabl = items(cfg, 'tenantAllowBlockSenders').find(i => lc(i.Value) === ext.address || lc(i.Value) === extDomain);
    if (tabl && /block/i.test(str(tabl.Action))) {
      add('Tenant Allow/Block List', `${tabl.Value} is blocked in the Tenant Allow/Block List. Exchange Online marks the message as high confidence spam (SCL 9), and the anti-spam policy decides what happens.`, 'high', [set('tenantAllowBlock', tabl.Value, 'Action', 'Block', 'tenantAllowBlockSenders')], { objects: [{ kind: 'tenantAllowBlock', name: tabl.Value }] });
      msg.verdict = 'hcspam'; msg.scl = 9; msg.forcedVerdict = `blocked sender ${tabl.Value} in the Tenant Allow/Block List`;
    } else if (tabl && /allow/i.test(str(tabl.Action))) {
      bypass.spam = true; bypass.why.push('an allow entry in the Tenant Allow/Block List');
      add('Tenant Allow/Block List', `${tabl.Value} is allowed in the Tenant Allow/Block List, so spam and spoof verdicts are overridden. Malware and high-confidence phishing still apply.`, 'medium', [set('tenantAllowBlock', tabl.Value, 'Action', 'Allow', 'tenantAllowBlockSenders')], { objects: [{ kind: 'tenantAllowBlock', name: tabl.Value }] });
    }

    if (malware(box)) return undefined;
    if (transportRules()) return undefined;
    if (dlp()) return undefined;
    // Content filtering, in Microsoft's order of precedence: phishing and high confidence spam first, then spoofing
    // and impersonation, then spam and bulk.
    if (!bypass.all && antiSpam(box, 'high')) return undefined;
    if (!bypass.all && antiPhish(box)) return undefined;
    if (!bypass.all && antiSpam(box, 'low')) return undefined;
    if (!bypass.all && safeAttachments(box)) return undefined;
    if (!bypass.all && safeLinks(box)) return undefined;
    journal();
    externalTag();
    retention();
    mailboxStage();
  }

  // -------------------------------------------------------------------------------------------------------------
  function outbound() {
    const box = msg.internal; const ext = msg.external; const extDomain = domainOf(ext.address);
    add('Outlook', `${box.displayName} <${box.address}> sends ${msg.kind === 'normal' ? 'a message' : msg.kind === 'autoforward' ? 'an automatic forward' : 'an automatic reply'} to ${ext.address}${msg.attachments.length ? ` with ${msg.attachments.length} attachment${msg.attachments.length > 1 ? 's' : ''}` : ''} (${sizeText(msg.sizeBytes)} with encoding).`, 'info');
    if (org.isAccepted(extDomain)) add('NextHop', `${extDomain} is one of the organization's own accepted domains, so this would not leave Exchange Online. Use an outside address to test outbound mail flow.`, 'medium');

    if (sizeCheck('send')) return undefined;

    // Manual sensitivity label
    if (msg.label) {
      const lab = items(cfg, 'sensitivityLabels').find(l => lc(l.DisplayName || l.Name) === lc(msg.label) || lc(l.Name) === lc(msg.label) || lc(l.Guid || l.ImmutableId) === lc(msg.label));
      if (lab) {
        const enc = bool(lab.EncryptionEnabled);
        if (enc) fate.encrypted = true;
        add('Sensitivity label', `The sender applied "${lab.DisplayName || lab.Name}".${enc ? ' The label encrypts, so the message is encrypted before it leaves; the outside recipient opens it with the Microsoft Purview Message Encryption portal or their own Microsoft account.' : ' It marks the message but does not encrypt it.'}`, enc ? 'info' : 'ok', [set('label', lab.DisplayName || lab.Name, 'EncryptionEnabled', enc ? 'True' : 'False', 'sensitivityLabels')], { objects: [{ kind: 'label', name: lab.DisplayName || lab.Name }] });
        msg.headers['msip_labels'] = lab.Guid || lab.Name;
      } else unknowns.push(`Sensitivity label "${msg.label}" is not in the export's sensitivityLabels section.`);
    }

    // Outbound spam policy and automatic forwarding
    missing('outboundSpamPolicies', 'Outbound spam policies');
    const ob = pickPolicy(cfg, { policies: 'outboundSpamPolicies', rules: 'outboundSpamRules', policyKey: 'HostedOutboundSpamFilterPolicy', presetRules: null, party: box, direction: 'sender' });
    if (ob.policy) {
      const mode = str(ob.policy.AutoForwardingMode || 'Automatic');
      const objects = [{ kind: 'outbound', name: ob.policy.Name }];
      if (msg.kind === 'autoforward') {
        if (/^on$/i.test(mode)) add('Outbound spam policy', `"${ob.policy.Name}" applies (${ob.via}). Automatic forwarding is On, so this forward is allowed to leave.`, 'medium', [set('outbound', ob.policy.Name, 'AutoForwardingMode', mode, 'outboundSpamPolicies')], { objects });
        else {
          add('Outbound spam policy', `"${ob.policy.Name}" applies (${ob.via}). Automatic forwarding is ${mode}${/automatic/i.test(mode) ? ' (system-controlled, which now means Off)' : ''}, so Exchange Online blocks the forward and the sender gets an NDR: 550 5.7.520 Access denied, Your organization does not allow external forwarding.`, 'high', [set('outbound', ob.policy.Name, 'AutoForwardingMode', mode, 'outboundSpamPolicies')], { objects });
          return end('Blocked: external automatic forwarding is off (550 5.7.520)', 'high', { ndr: '550 5.7.520' });
        }
      } else add('Outbound spam policy', `"${ob.policy.Name}" applies (${ob.via}). Sending limits: ${ob.policy.RecipientLimitExternalPerHour || 'default'} outside recipients an hour, ${ob.policy.RecipientLimitPerDay || 'default'} a day; over the limit the sender is ${lc(ob.policy.ActionWhenThresholdReached || 'BlockUserForToday') === 'alert' ? 'only reported' : 'blocked from sending'}. One message stays well under it.`, 'ok', [set('outbound', ob.policy.Name, 'RecipientLimitExternalPerHour', ob.policy.RecipientLimitExternalPerHour || 'default', 'outboundSpamPolicies')], { objects });
      if (msg.verdict !== 'clean') add('Outbound spam filter', `You marked the content as ${VERDICTS[msg.verdict].toLowerCase()}. Outbound spam is sent through the high-risk delivery pool, and repeated spam gets ${box.address} restricted from sending.`, 'medium');
    }

    if (malware(box)) return undefined;
    if (transportRules()) return undefined;
    if (dlp()) return undefined;
    autoLabel();
    journal();
    if (remoteDomain(extDomain)) return undefined;
    dkim();
    connectorOut(extDomain);
  }

  // -------------------------------------------------------------------------------------------------------------
  function sizeCheck(which) {
    const tc = items(cfg, 'transportConfig')[0] || {};
    const mbx = org.mailbox.raw || {};
    const orgLimit = bytesOf(which === 'send' ? tc.MaxSendSize : tc.MaxReceiveSize);
    const boxLimit = bytesOf(which === 'send' ? mbx.MaxSendSize : mbx.MaxReceiveSize);
    const limits = [[boxLimit, 'mailbox', which === 'send' ? 'MaxSendSize' : 'MaxReceiveSize', 'mailbox', org.mailbox.primary], [orgLimit, 'transportConfig', which === 'send' ? 'MaxSendSize' : 'MaxReceiveSize', 'transportConfig', 'Transport configuration']].filter(([l]) => l != null);
    const hit = limits.find(([l]) => l !== Infinity && msg.sizeBytes > l);
    if (hit) {
      add('Message size limit', `The message is ${sizeText(msg.sizeBytes)} with encoding, over the ${hit[1] === 'mailbox' ? 'mailbox' : 'organization'} ${which} limit of ${sizeText(hit[0])}. Exchange Online rejects it: 552 5.3.4 Message size exceeds fixed maximum message size.`, 'high', [set(hit[1] === 'mailbox' ? 'mailbox' : 'transportConfig', hit[4], hit[2], sizeText(hit[0]), hit[3])]);
      end(`Rejected: too large (${sizeText(msg.sizeBytes)}, limit ${sizeText(hit[0])})`, 'high', { ndr: '552 5.3.4' });
      return true;
    }
    if (limits.length) add('Message size limit', `${sizeText(msg.sizeBytes)} is under the ${which} limits (${limits.map(([l, k]) => `${k === 'mailbox' ? 'mailbox' : 'organization'} ${sizeText(l)}`).join(', ')}).`, 'ok', limits.map(([l, , prop, sec, name]) => set(sec === 'mailbox' ? 'mailbox' : 'transportConfig', name, prop, sizeText(l), sec)));
    if (which === 'receive') {
      const quota = bytesOf(mbx.ProhibitSendReceiveQuota);
      const used = bytesOf(items(cfg, 'mailboxStatistics')[0]?.TotalItemSize);
      if (quota && used != null && quota !== Infinity && used >= quota) {
        add('Mailbox quota', `${org.mailbox.primary} is full (${sizeText(used)} of ${sizeText(quota)}), so it cannot receive: 552 5.2.2 Mailbox full.`, 'high', [set('mailbox', org.mailbox.primary, 'ProhibitSendReceiveQuota', sizeText(quota), 'mailbox')]);
        end('Rejected: mailbox full (552 5.2.2)', 'high', { ndr: '552 5.2.2' });
        return true;
      }
    }
    return false;
  }

  function malware(party) {
    missing('antiMalwarePolicies', 'Anti-malware policies');
    // Outbound too, the policy is the one that covers the person inside the organization.
    const pick = pickPolicy(cfg, { policies: 'antiMalwarePolicies', rules: 'antiMalwareRules', policyKey: 'MalwareFilterPolicy', party });
    const pol = pick.policy;
    if (!pol) { add('Anti-malware', 'No anti-malware policy is in the export. Microsoft always scans for malware; NextHop cannot say which settings apply.', 'medium'); return false; }
    const objects = [{ kind: 'antiMalware', name: pol.Name }];
    const q = quarantineWords(cfg, pol.QuarantineTag);
    if (msg.malware) {
      add('Anti-malware', `You marked an attachment as malware. "${pol.Name}" applies (${pick.via}): the whole message is quarantined as malware; ${q.words}.`, 'high', [set('antiMalware', pol.Name, 'QuarantineTag', q.name, 'antiMalwarePolicies')], { objects: [...objects, { kind: 'quarantinePolicy', name: q.name }] });
      end('Quarantined as malware', 'high', { where: 'Quarantine (malware)' });
      return true;
    }
    if (bool(pol.EnableFileFilter ?? true) && msg.attachments.length) {
      const types = list(pol.FileTypes).map(lc);
      const bad = msg.attachments.find(a => types.includes(a.ext));
      if (bad) {
        const reject = /reject/i.test(str(pol.FileTypeAction || 'Reject'));
        add('Anti-malware: common attachments filter', `"${pol.Name}" applies (${pick.via}). ${bad.name} has the blocked file type .${bad.ext}, so the message is ${reject ? 'rejected with an NDR (550 5.7.1)' : `quarantined as malware; ${q.words}`}.`, 'high', [set('antiMalware', pol.Name, 'FileTypes', `.${bad.ext} is listed`, 'antiMalwarePolicies'), set('antiMalware', pol.Name, 'FileTypeAction', pol.FileTypeAction || 'Reject', 'antiMalwarePolicies')], { objects });
        end(reject ? `Rejected: blocked attachment type .${bad.ext} (550 5.7.1)` : 'Quarantined as malware (blocked file type)', 'high', reject ? { ndr: '550 5.7.1' } : { where: 'Quarantine (malware)' });
        return true;
      }
    }
    add('Anti-malware', `"${pol.Name}" applies (${pick.via}). ${msg.attachments.length ? `No attachment has a blocked file type${bool(pol.EnableFileFilter ?? true) ? '' : ' (the common attachments filter is off)'}` : 'No attachments'}, and you did not mark anything as malware.`, 'ok', [set('antiMalware', pol.Name, 'EnableFileFilter', bool(pol.EnableFileFilter ?? true) ? 'True' : 'False', 'antiMalwarePolicies')], { objects });
    return false;
  }

  function transportRules() {
    if (missing('transportRules', 'Mail flow rules')) return false;
    const now = Date.now();
    const rules = items(cfg, 'transportRules').slice().sort((a, b) => Number(a.Priority ?? 999) - Number(b.Priority ?? 999));
    if (!rules.length) { add('Mail flow rules', 'There are no mail flow rules.', 'ok'); return false; }
    let matchedAny = false; let stopped = null; const skipped = [];
    for (const rule of rules) {
      const name = str(rule.Name || rule.Identity);
      const objects = [{ kind: 'transportRule', name }];
      if (stopped) { skipped.push(`"${name}" (stopped by "${stopped}")`); continue; }
      if (/disabled/i.test(str(rule.State))) { skipped.push(`"${name}" (disabled)`); continue; }
      if (rule.ActivationDate && Date.parse(rule.ActivationDate) > now) { skipped.push(`"${name}" (starts ${str(rule.ActivationDate).slice(0, 10)})`); continue; }
      if (rule.ExpiryDate && Date.parse(rule.ExpiryDate) < now) { skipped.push(`"${name}" (expired ${str(rule.ExpiryDate).slice(0, 10)})`); continue; }
      const tests = ruleConditionTests(cfg, org, msg);
      const c = evalConditions(rule, tests);
      if (c.unsupported.length) {
        unknowns.push(`Mail flow rule "${name}" uses ${c.unsupported.join(', ')}, which NextHop cannot judge from configuration alone. It was treated as not matching.`);
        add('Mail flow rule', `"${name}" (priority ${rule.Priority ?? '?'}) uses ${c.unsupported.join(', ')}, which NextHop cannot judge. Treated as not matching; check it by hand.`, 'medium', [set('transportRule', name, 'Conditions', c.unsupported, 'transportRules')], { objects });
        continue;
      }
      if (c.failed) { skipped.push(`"${name}" (${c.failed})`); continue; }
      const ex = evalConditions(rule, tests, 'ExceptIf');
      if (ex.any) { skipped.push(`"${name}" (exception: ${ex.reasons[0]})`); continue; }
      matchedAny = true;
      const audit = /audit/i.test(str(rule.Mode));
      const actions = ruleActions(rule);
      const why = c.reasons.length ? c.reasons.join(', and ') : 'it has no conditions, so it matches every message';
      if (audit) {
        add('Mail flow rule (test mode)', `"${name}" matches because ${why}. It is in test mode (${rule.Mode}), so it only writes to the message trace report and does not act. If enforced it would: ${actions.map(a => a.words).join('; ') || 'do nothing'}.`, 'medium', [set('transportRule', name, 'Mode', rule.Mode, 'transportRules'), ...actions.map(a => set('transportRule', name, a.prop, a.value, 'transportRules'))], { objects });
      } else {
        add('Mail flow rule', `"${name}" (priority ${rule.Priority ?? '?'}) matches because ${why}. ${actions.length ? `It ${actions.map(a => a.words).join('; ')}.` : 'It has no action NextHop recognises.'}`, actions.some(a => a.terminal) ? 'high' : actions.some(a => a.tone === 'medium') ? 'medium' : 'info', actions.map(a => set('transportRule', name, a.prop, a.value, 'transportRules')), { objects });
        for (const a of actions) a.apply?.();
        if (fate.done) return true;
        if (bool(rule.StopRuleProcessing)) stopped = name;
      }
    }
    if (skipped.length) add('Mail flow rules', `${matchedAny ? 'The other rules do' : 'No rule matches. These do'} not apply: ${skipped.join('; ')}.`, 'ok', [], { detail: skipped });
    return false;
  }

  function ruleActions(rule) {
    const out = [];
    const a = (prop, words, opts = {}) => out.push({ prop, value: opts.value ?? (Array.isArray(rule[prop]) ? rule[prop].join(', ') : str(rule[prop])), words, ...opts });
    if (nonEmpty(rule.RejectMessageReasonText) || nonEmpty(rule.RejectMessageEnhancedStatusCode)) {
      const code = str(rule.RejectMessageEnhancedStatusCode || '5.7.1');
      a(nonEmpty(rule.RejectMessageReasonText) ? 'RejectMessageReasonText' : 'RejectMessageEnhancedStatusCode', `rejects the message and sends the sender an NDR (550 ${code}${rule.RejectMessageReasonText ? `: "${rule.RejectMessageReasonText}"` : ''})`, { terminal: true, apply: () => end(`Rejected by mail flow rule "${rule.Name}" (550 ${code})`, 'high', { ndr: `550 ${code}` }) });
    }
    if (bool(rule.DeleteMessage)) a('DeleteMessage', 'deletes the message without telling anyone', { terminal: true, apply: () => end(`Deleted silently by mail flow rule "${rule.Name}"`, 'high', { where: 'Deleted' }) });
    if (bool(rule.Quarantine)) a('Quarantine', 'sends the message to hosted quarantine, where only admins can release it', { terminal: true, apply: () => end(`Quarantined by mail flow rule "${rule.Name}"`, 'high', { where: 'Quarantine (mail flow rule)' }) });
    if (nonEmpty(rule.ModerateMessageByUser)) a('ModerateMessageByUser', `holds the message until ${list(rule.ModerateMessageByUser).join(', ')} approves it`, { terminal: true, apply: () => end(`Waiting for approval from ${list(rule.ModerateMessageByUser).join(', ')} (moderation)`, 'medium', { where: 'Held for moderation' }) });
    if (bool(rule.ModerateMessageByManager)) {
      const mgr = str(msg.from.user?.Manager || '');
      a('ModerateMessageByManager', `holds the message until the sender's manager${mgr ? ` (${mgr})` : ''} approves it${mgr ? '' : '; the export has no manager for the sender, so Exchange would let it through'}`, { terminal: Boolean(mgr), apply: () => { if (mgr) end(`Waiting for approval from the sender's manager, ${mgr}`, 'medium', { where: 'Held for moderation' }); } });
    }
    if (nonEmpty(rule.RedirectMessageTo)) a('RedirectMessageTo', `redirects it to ${list(rule.RedirectMessageTo).join(', ')} instead of the original recipient`, { tone: 'medium', terminal: true, apply: () => end(`Redirected to ${list(rule.RedirectMessageTo).join(', ')} by mail flow rule "${rule.Name}"`, 'medium', { where: 'Redirected' }) });
    if (rule.SetSCL != null && rule.SetSCL !== '') {
      const scl = Number(rule.SetSCL);
      a('SetSCL', scl === -1 ? 'sets the spam confidence level to -1, so spam filtering is skipped' : `sets the spam confidence level to ${scl}`, { tone: scl === -1 ? 'medium' : 'info', apply: () => { msg.scl = scl; if (scl === -1) { bypass.spam = true; bypass.why.push(`mail flow rule "${rule.Name}" (SCL -1)`); } else if (scl >= 7) msg.verdict = 'hcspam'; else if (scl >= 5) msg.verdict = 'spam'; } });
    }
    if (nonEmpty(rule.PrependSubject)) a('PrependSubject', `adds "${rule.PrependSubject}" to the start of the subject`, { apply: () => { msg.subject = `${rule.PrependSubject}${msg.subject}`; } });
    if (nonEmpty(rule.ApplyHtmlDisclaimerText)) a('ApplyHtmlDisclaimerText', `adds a disclaimer at the ${lc(rule.ApplyHtmlDisclaimerLocation || 'Append') === 'prepend' ? 'top' : 'bottom'} ("${str(rule.ApplyHtmlDisclaimerText).replace(/<[^>]+>/g, '').slice(0, 80)}")`);
    if (nonEmpty(rule.SetHeaderName)) a('SetHeaderName', `sets the header ${rule.SetHeaderName}: ${rule.SetHeaderValue ?? ''}`, { value: `${rule.SetHeaderName}: ${rule.SetHeaderValue ?? ''}`, apply: () => { msg.headers[lc(rule.SetHeaderName)] = str(rule.SetHeaderValue); } });
    if (nonEmpty(rule.RemoveHeader)) a('RemoveHeader', `removes the header ${rule.RemoveHeader}`, { apply: () => { delete msg.headers[lc(rule.RemoveHeader)]; } });
    if (bool(rule.ApplyOME)) a('ApplyOME', 'encrypts it with Microsoft Purview Message Encryption', { apply: () => { fate.encrypted = true; } });
    if (nonEmpty(rule.ApplyRightsProtectionTemplate)) a('ApplyRightsProtectionTemplate', `protects it with the "${rule.ApplyRightsProtectionTemplate}" template`, { apply: () => { fate.encrypted = true; } });
    if (bool(rule.RemoveOME)) a('RemoveOME', 'removes message encryption', { apply: () => { fate.encrypted = false; } });
    if (nonEmpty(rule.BlindCopyTo)) a('BlindCopyTo', `Bcc's a copy to ${list(rule.BlindCopyTo).join(', ')}`, { apply: () => copies.push({ to: list(rule.BlindCopyTo).join(', '), why: `Bcc from mail flow rule "${rule.Name}"` }) });
    if (nonEmpty(rule.CopyTo)) a('CopyTo', `Cc's ${list(rule.CopyTo).join(', ')}`, { apply: () => copies.push({ to: list(rule.CopyTo).join(', '), why: `Cc from mail flow rule "${rule.Name}"` }) });
    if (nonEmpty(rule.AddToRecipients)) a('AddToRecipients', `adds ${list(rule.AddToRecipients).join(', ')} to the To line`, { apply: () => copies.push({ to: list(rule.AddToRecipients).join(', '), why: `added recipient from mail flow rule "${rule.Name}"` }) });
    if (nonEmpty(rule.AddManagerAsRecipientType)) a('AddManagerAsRecipientType', `adds the sender's manager as ${rule.AddManagerAsRecipientType}`);
    if (nonEmpty(rule.RouteMessageOutboundConnector)) a('RouteMessageOutboundConnector', `routes it out through the connector "${rule.RouteMessageOutboundConnector}"`, { apply: () => { msg.forcedConnector = str(rule.RouteMessageOutboundConnector); msg.forcedBy = str(rule.Name); } });
    if (bool(rule.RouteMessageOutboundRequireTls)) a('RouteMessageOutboundRequireTls', 'requires TLS when it leaves', { apply: () => { msg.requireTls = true; } });
    if (nonEmpty(rule.GenerateIncidentReport)) a('GenerateIncidentReport', `sends an incident report to ${list(rule.GenerateIncidentReport).join(', ')}`, { apply: () => copies.push({ to: list(rule.GenerateIncidentReport).join(', '), why: `incident report from mail flow rule "${rule.Name}"` }) });
    if (nonEmpty(rule.GenerateNotification)) a('GenerateNotification', 'sends a notification to the sender or recipient');
    if (nonEmpty(rule.ApplyClassification)) a('ApplyClassification', `applies the message classification ${rule.ApplyClassification}`);
    if (nonEmpty(rule.SetAuditSeverity) && !/donotaudit/i.test(str(rule.SetAuditSeverity))) a('SetAuditSeverity', `logs at ${rule.SetAuditSeverity} severity in the rule report`);
    return out;
  }

  function dlp() {
    if (missing('dlpPolicies', 'DLP policies')) return false;
    const pols = items(cfg, 'dlpPolicies').filter(p => p.Enabled !== false && !/^disable/i.test(str(p.Mode)) && (list(p.Workload).length === 0 || /exchange/i.test(list(p.Workload).join(','))));
    if (!pols.length) { add('Data loss prevention', 'No DLP policy covers Exchange email.', 'ok'); return false; }
    const sender = msg.from;
    const text = textOf(msg);
    let any = false;
    for (const pol of pols) {
      const loc = list(pol.ExchangeLocation).map(x => lc(typeof x === 'object' ? (x.Name || x.DisplayName) : x));
      const locEx = list(pol.ExchangeLocationException).map(x => lc(typeof x === 'object' ? (x.Name || x.DisplayName) : x));
      const inScope = loc.includes('all') || (sender.internal && sender.addresses.some(a => loc.includes(a))) || (sender.internal && sender.memberOf.some(g => g.keys.some(k => loc.includes(k))));
      if (!inScope || (sender.internal && sender.addresses.some(a => locEx.includes(a)))) continue;
      const rules = items(cfg, 'dlpRules').filter(r => lc(r.ParentPolicyName || r.Policy) === lc(pol.Name)).filter(r => !bool(r.Disabled)).sort((a, b) => Number(a.Priority ?? 99) - Number(b.Priority ?? 99));
      const test = /^test/i.test(str(pol.Mode));
      for (const r of rules) {
        const objects = [{ kind: 'dlp', name: pol.Name }];
        const reasons = []; let fail = null;
        const refs = sitRefs(r.ContentContainsSensitiveInformation);
        if (refs.length) {
          const m = matchSits(refs, text, cfg);
          if (m.unknown.length && !m.matched.length) { unknowns.push(`DLP rule "${r.Name}" looks for ${m.unknown.join(', ')}, which NextHop cannot detect. It recognises: ${SIT_DETECTORS.map(d => d.name).join(', ')}.`); fail = 'unknown type'; }
          else if (!m.matched.length) fail = `no ${refs.map(x => x.name || x.id).join(' or ')} found`;
          else reasons.push(`the message contains ${m.matched.map(x => `${x.count} ${x.name}${x.count > 1 ? ' matches' : ''}`).join(' and ')}`);
        }
        if (!fail && nonEmpty(r.AccessScope)) {
          const outside = !inOrg(msg.to, org);
          if (lc(r.AccessScope) === 'notinorganization' && !outside) fail = 'the recipient is inside';
          else if (lc(r.AccessScope) === 'inorganization' && outside) fail = 'the recipient is outside';
          else reasons.push(lc(r.AccessScope) === 'notinorganization' ? 'it is going to someone outside the organization' : 'it is staying inside the organization');
        }
        const wordTests = { SubjectContainsWords: msg.subject, SubjectOrBodyContainsWords: `${msg.subject}\n${msg.body}` };
        for (const [k, t] of Object.entries(wordTests)) if (!fail && nonEmpty(r[k])) { const w = firstWord(t, r[k]); if (w) reasons.push(`it contains "${w}"`); else fail = `no ${k} words`; }
        if (!fail && nonEmpty(r.ContentExtensionMatchesWords)) { const at = msg.attachments.find(x => list(r.ContentExtensionMatchesWords).map(lc).includes(x.ext)); if (at) reasons.push(`attachment ${at.name}`); else fail = 'no matching attachment type'; }
        if (!fail && nonEmpty(r.SentToMemberOf)) { const g = memberOfAny(r.SentToMemberOf, msg.to); if (g) reasons.push(`the recipient is in ${g}`); else fail = 'recipient not in the group'; }
        if (!fail && nonEmpty(r.RecipientDomainIs)) { const d = list(r.RecipientDomainIs).find(x => domainMatches(domainOf(msg.to.address), x)); if (d) reasons.push(`the recipient domain is ${d}`); else fail = 'recipient domain'; }
        if (!fail && nonEmpty(r.SenderDomainIs)) { const d = list(r.SenderDomainIs).find(x => domainMatches(domainOf(msg.from.address), x)); if (d) reasons.push(`the sender domain is ${d}`); else fail = 'sender domain'; }
        if (!fail && nonEmpty(r.ExceptIfSentToMemberOf) && memberOfAny(r.ExceptIfSentToMemberOf, msg.to)) fail = 'exception';
        if (!fail && nonEmpty(r.ExceptIfRecipientDomainIs) && list(r.ExceptIfRecipientDomainIs).some(x => domainMatches(domainOf(msg.to.address), x))) fail = `exception for ${domainOf(msg.to.address)}`;
        if (fail || !reasons.length) continue;
        any = true;
        const acts = [];
        const block = bool(r.BlockAccess);
        if (block) acts.push(`blocks it${lc(r.BlockAccessScope) === 'perUser'.toLowerCase() ? ' for people outside' : ''}`);
        if (nonEmpty(r.NotifyUser)) acts.push('shows the sender a policy tip and emails them a notification');
        if (nonEmpty(r.NotifyAllowOverride)) acts.push(`lets the sender override it (${list(r.NotifyAllowOverride).join(', ')})`);
        if (nonEmpty(r.EncryptRMSTemplate)) acts.push(`encrypts it with ${r.EncryptRMSTemplate}`);
        if (nonEmpty(r.GenerateIncidentReport)) acts.push(`sends an incident report to ${list(r.GenerateIncidentReport).join(', ')}`);
        if (nonEmpty(r.GenerateAlert)) acts.push('raises an alert in Purview');
        if (nonEmpty(r.ModifySubject)) acts.push('changes the subject');
        const settings = [set('dlp', pol.Name, 'Mode', pol.Mode || 'Enable', 'dlpPolicies'), set('dlp', `${pol.Name} > ${r.Name}`, refs.length ? 'ContentContainsSensitiveInformation' : 'Conditions', refs.length ? refs.map(x => `${x.name || x.id} (min ${x.minCount})`) : reasons, 'dlpRules')];
        if (block) settings.push(set('dlp', `${pol.Name} > ${r.Name}`, 'BlockAccess', 'True', 'dlpRules'));
        if (test) {
          add('Data loss prevention (test mode)', `"${pol.Name}" rule "${r.Name}" matches because ${reasons.join(' and ')}. The policy is in test mode (${pol.Mode}), so nothing is blocked${/notifications/i.test(str(pol.Mode)) && !/without/i.test(str(pol.Mode)) ? '; the sender still sees the policy tip' : ''}. If turned on it would: ${acts.join('; ') || 'only log it'}.`, 'medium', settings, { objects });
          continue;
        }
        if (nonEmpty(r.GenerateIncidentReport)) copies.push({ to: list(r.GenerateIncidentReport).join(', '), why: `DLP incident report, rule "${r.Name}"` });
        if (nonEmpty(r.EncryptRMSTemplate)) fate.encrypted = true;
        const override = block && nonEmpty(r.NotifyAllowOverride);
        if (override) fate.override = `"${pol.Name}" rule "${r.Name}"`;
        add('Data loss prevention', `"${pol.Name}" rule "${r.Name}" matches because ${reasons.join(' and ')}. It ${acts.join('; ') || 'logs the match'}.${override ? ' If the sender overrides with a justification, it is delivered.' : ''}`, block && !override ? 'high' : 'medium', settings, { objects });
        if (block && !override) {
          end(`Blocked by DLP policy "${pol.Name}" (550 5.7.1 Delivery not authorized, message refused)`, 'high', { ndr: '550 5.7.1' });
          return true;
        }
        if (bool(r.StopPolicyProcessing)) break;
      }
    }
    if (!any) add('Data loss prevention', `${pols.length} DLP polic${pols.length > 1 ? 'ies cover' : 'y covers'} email (${pols.map(p => `"${p.Name}"`).join(', ')}), and none of their rules match this message.`, 'ok', [], { objects: pols.map(p => ({ kind: 'dlp', name: p.Name })) });
    return false;
  }

  function antiSpam(box, stage) {
    const high = ['phish', 'hcphish', 'hcspam'].includes(msg.verdict);
    if ((stage === 'high') !== high) return false;
    missing('antiSpamPolicies', 'Anti-spam policies');
    const pick = pickPolicy(cfg, { policies: 'antiSpamPolicies', rules: 'antiSpamRules', policyKey: 'HostedContentFilterPolicy', party: box });
    const pol = pick.policy;
    if (bypass.spam) { add('Anti-spam', `Spam filtering is skipped because of ${bypass.why.join(' and ')}.${msg.verdict !== 'clean' ? ` The ${VERDICTS[msg.verdict].toLowerCase()} you chose is ignored${['hcphish'].includes(msg.verdict) ? ', except high confidence phishing, which is still caught' : ''}.` : ''}`, 'medium'); if (msg.verdict === 'hcphish' && pol) return verdictAction(pol, pick, 'HighConfidencePhishAction', 'high confidence phishing', 'HighConfidencePhishQuarantineTag'); return false; }
    if (!pol) { add('Anti-spam', 'No anti-spam policy is in the export.', 'medium'); return false; }
    const objects = [{ kind: 'antiSpam', name: pol.Name }];
    const ext = msg.external; const extDomain = domainOf(ext.address);
    const allowed = list(pol.AllowedSenders).map(lc).includes(ext.address) ? ext.address : list(pol.AllowedSenderDomains).map(lc).includes(extDomain) ? extDomain : null;
    const blocked = list(pol.BlockedSenders).map(lc).includes(ext.address) ? ext.address : list(pol.BlockedSenderDomains).map(lc).includes(extDomain) ? extDomain : null;
    if (blocked) { msg.verdict = 'hcspam'; msg.forcedVerdict = `blocked sender ${blocked} in "${pol.Name}"`; }
    else if (allowed && !['hcphish', 'phish'].includes(msg.verdict)) {
      add('Anti-spam', `"${pol.Name}" applies (${pick.via}) and lists ${allowed} as an allowed sender, so spam filtering is skipped for it. Anyone who can spoof ${allowed} gets the same pass.`, 'medium', [set('antiSpam', pol.Name, allowed.includes('@') ? 'AllowedSenders' : 'AllowedSenderDomains', allowed, 'antiSpamPolicies')], { objects });
      return false;
    }
    if (msg.verdict === 'bulk' || (msg.verdict === 'clean' && msg.bcl > 0)) {
      const th = Number(pol.BulkThreshold ?? 7);
      if (msg.bcl >= th) return verdictAction(pol, pick, 'BulkSpamAction', `bulk mail (BCL ${msg.bcl}, threshold ${th})`, 'BulkQuarantineTag', [set('antiSpam', pol.Name, 'BulkThreshold', th, 'antiSpamPolicies')]);
      add('Anti-spam', `"${pol.Name}" applies (${pick.via}). Bulk complaint level ${msg.bcl} is under the threshold of ${th}, so it is not treated as bulk.`, 'ok', [set('antiSpam', pol.Name, 'BulkThreshold', th, 'antiSpamPolicies')], { objects });
      return false;
    }
    const map = { spam: ['SpamAction', 'spam', 'SpamQuarantineTag'], hcspam: ['HighConfidenceSpamAction', 'high confidence spam', 'HighConfidenceSpamQuarantineTag'], phish: ['PhishSpamAction', 'phishing', 'PhishQuarantineTag'], hcphish: ['HighConfidencePhishAction', 'high confidence phishing', 'HighConfidencePhishQuarantineTag'] };
    if (map[msg.verdict]) return verdictAction(pol, pick, ...map[msg.verdict]);
    add('Anti-spam', `"${pol.Name}" applies (${pick.via}). You chose "not spam" as the filter's verdict (SCL 1), so nothing happens here. NextHop cannot score real content; change the verdict to see what this policy would do.`, 'ok', [set('antiSpam', pol.Name, 'SpamAction', pol.SpamAction || 'MoveToJmf', 'antiSpamPolicies')], { objects });
    return false;
  }

  function verdictAction(pol, pick, prop, words, tagProp, more = []) {
    const action = str(pol[prop] || (prop === 'HighConfidencePhishAction' ? 'Quarantine' : 'MoveToJmf'));
    const objects = [{ kind: 'antiSpam', name: pol.Name }];
    const why = msg.forcedVerdict ? ` (because of the ${msg.forcedVerdict})` : '';
    let text = `"${pol.Name}" applies (${pick.via}). The message is ${words}${why}, and the action for that is ${action}: ${ACTION_WORDS[lc(action)] || action}`;
    const settings = [set('antiSpam', pol.Name, prop, action, 'antiSpamPolicies'), ...more];
    const a = lc(action);
    if (a === 'quarantine') {
      const q = quarantineWords(cfg, pol[tagProp]);
      text += `; ${q.words}`;
      settings.push(set('quarantinePolicy', q.name, tagProp, q.name, 'quarantinePolicies'));
      objects.push({ kind: 'quarantinePolicy', name: q.name });
      add('Anti-spam', `${text}.`, 'high', settings, { objects });
      end(`Quarantined as ${words}`, 'high', { where: `Quarantine (${words})` });
      return true;
    }
    if (a === 'delete') { add('Anti-spam', `${text}.`, 'high', settings, { objects }); end(`Deleted as ${words}`, 'high', { where: 'Deleted' }); return true; }
    if (a === 'redirect') { add('Anti-spam', `${text} (${list(pol.RedirectToRecipients).join(', ')}).`, 'medium', settings, { objects }); end(`Redirected as ${words}`, 'medium', { where: 'Redirected' }); return true; }
    if (a === 'modifysubject') msg.subject = `${pol.ModifySubjectValue || '[SPAM]'} ${msg.subject}`;
    if (a === 'movetojmf') fate.where = 'Junk Email folder';
    add('Anti-spam', `${text}.`, a === 'noaction' || a === 'addxheader' ? 'info' : 'medium', settings, { objects });
    return false;
  }

  function antiPhish(box) {
    missing('antiPhishPolicies', 'Anti-phishing policies');
    const pick = pickPolicy(cfg, { policies: 'antiPhishPolicies', rules: 'antiPhishRules', policyKey: 'AntiPhishPolicy', party: box });
    const pol = pick.policy;
    if (!pol) { add('Anti-phishing', 'No anti-phishing policy is in the export.', 'medium'); return false; }
    const objects = [{ kind: 'antiPhish', name: pol.Name }];
    const ext = msg.external; const extDomain = domainOf(ext.address);
    const excluded = list(pol.ExcludedSenders).map(lc).includes(ext.address) || list(pol.ExcludedDomains).map(lc).includes(extDomain);

    // Impersonation: a protected user's display name from a different address, or a look-alike of a protected domain.
    if (!excluded) {
      if (bool(pol.EnableTargetedUserProtection)) {
        const hit = list(pol.TargetedUsersToProtect).map(s => { const [n, a] = str(s).split(';'); return { name: n?.trim(), address: lc(a) }; }).find(u => u.name && lc(u.name) === lc(ext.displayName) && u.address !== ext.address);
        if (hit) return phishAction(pol, pick, 'TargetedUserProtectionAction', `user impersonation: the display name "${ext.displayName}" belongs to protected user ${hit.address}, but the address is ${ext.address}`, 'TargetedUserQuarantineTag', [set('antiPhish', pol.Name, 'TargetedUsersToProtect', `${hit.name};${hit.address}`, 'antiPhishPolicies')]);
      }
      const protectedDomains = [...(bool(pol.EnableTargetedDomainsProtection) ? list(pol.TargetedDomainsToProtect) : []), ...(bool(pol.EnableOrganizationDomainsProtection) ? org.domains.map(d => d.name) : [])].map(lc);
      const look = protectedDomains.find(d => d !== extDomain && lookalike(extDomain, d));
      if (look) return phishAction(pol, pick, 'TargetedDomainProtectionAction', `domain impersonation: ${extDomain} looks like the protected domain ${look}`, 'TargetedDomainQuarantineTag', [set('antiPhish', pol.Name, org.domains.some(d => d.name === look) ? 'EnableOrganizationDomainsProtection' : 'TargetedDomainsToProtect', look, 'antiPhishPolicies')]);
    }

    // Spoof and DMARC
    if (msg.auth !== 'pass') {
      const spoofAllow = items(cfg, 'tenantAllowBlockSpoof').find(s => /allow/i.test(str(s.Action)) && domainMatches(extDomain, s.SpoofedUser));
      if (spoofAllow) add('Anti-phishing: spoof', `${extDomain} fails authentication, but the Tenant Allow/Block List allows it to be spoofed from ${spoofAllow.SendingInfrastructure}. NextHop assumes this message comes from that infrastructure.`, 'medium', [set('tenantAllowBlock', spoofAllow.SpoofedUser, 'SendingInfrastructure', spoofAllow.SendingInfrastructure, 'tenantAllowBlockSpoof')], { objects: [{ kind: 'tenantAllowBlock', name: spoofAllow.SpoofedUser }] });
      else if (/^dmarc-(reject|quarantine)$/.test(msg.auth) && bool(pol.HonorDmarcPolicy ?? true)) {
        const reject = msg.auth === 'dmarc-reject';
        const prop = reject ? 'DmarcRejectAction' : 'DmarcQuarantineAction';
        const action = str(pol[prop] || (reject ? 'Reject' : 'Quarantine'));
        const settings = [set('antiPhish', pol.Name, 'HonorDmarcPolicy', 'True', 'antiPhishPolicies'), set('antiPhish', pol.Name, prop, action, 'antiPhishPolicies')];
        if (/reject/i.test(action)) { add('Anti-phishing: DMARC', `"${pol.Name}" applies (${pick.via}) and honors the sender's DMARC policy. ${extDomain} fails DMARC with p=reject, so the message is rejected (550 5.7.509 Access denied, sending domain does not pass DMARC verification).`, 'high', settings, { objects }); end('Rejected: the sender fails DMARC with p=reject (550 5.7.509)', 'high', { ndr: '550 5.7.509' }); return true; }
        if (/quarantine/i.test(action)) { const q = quarantineWords(cfg, pol.SpoofQuarantineTag); add('Anti-phishing: DMARC', `"${pol.Name}" applies (${pick.via}) and honors DMARC. ${extDomain} fails with p=${reject ? 'reject' : 'quarantine'}, and the action is Quarantine; ${q.words}.`, 'high', settings, { objects }); end('Quarantined: the sender fails DMARC', 'high', { where: 'Quarantine (spoof)' }); return true; }
        fate.where = 'Junk Email folder';
        add('Anti-phishing: DMARC', `"${pol.Name}" honors DMARC. ${extDomain} fails, and the action is ${action}: moved to the Junk Email folder.`, 'medium', settings, { objects });
      } else if (bool(pol.EnableSpoofIntelligence ?? true)) {
        const action = str(pol.AuthenticationFailAction || 'MoveToJmf');
        const settings = [set('antiPhish', pol.Name, 'EnableSpoofIntelligence', 'True', 'antiPhishPolicies'), set('antiPhish', pol.Name, 'AuthenticationFailAction', action, 'antiPhishPolicies')];
        if (/quarantine/i.test(action)) { const q = quarantineWords(cfg, pol.SpoofQuarantineTag); add('Anti-phishing: spoof', `"${pol.Name}" applies (${pick.via}). ${extDomain} fails authentication (${AUTH_RESULTS[msg.auth]}), spoof intelligence catches it, and the action is Quarantine; ${q.words}.`, 'high', settings, { objects }); end('Quarantined as spoofed', 'high', { where: 'Quarantine (spoof)' }); return true; }
        fate.where = 'Junk Email folder';
        add('Anti-phishing: spoof', `"${pol.Name}" applies (${pick.via}). ${extDomain} fails authentication (${AUTH_RESULTS[msg.auth]}), so spoof intelligence moves it to the Junk Email folder${bool(pol.EnableUnauthenticatedSender ?? true) ? ' and Outlook shows a "?" on the sender' : ''}.`, 'medium', settings, { objects });
      } else add('Anti-phishing: spoof', `"${pol.Name}" has spoof intelligence off, so a message that fails authentication is not caught here.`, 'high', [set('antiPhish', pol.Name, 'EnableSpoofIntelligence', 'False', 'antiPhishPolicies')], { objects });
    } else {
      add('Anti-phishing', `"${pol.Name}" applies (${pick.via}). The sender passes authentication and does not impersonate a protected user or domain${excluded ? ' (it is also an excluded sender)' : ''}.${bool(pol.EnableFirstContactSafetyTips) ? ' First contact safety tip: Outlook shows "You don\'t often get email from" if the recipient rarely hears from this sender.' : ''}`, 'ok', [set('antiPhish', pol.Name, 'EnableSpoofIntelligence', bool(pol.EnableSpoofIntelligence ?? true) ? 'True' : 'False', 'antiPhishPolicies')], { objects });
    }
    return false;
  }
  function phishAction(pol, pick, prop, words, tagProp, settings) {
    const action = str(pol[prop] || 'NoAction');
    const objects = [{ kind: 'antiPhish', name: pol.Name }];
    const all = [...settings, set('antiPhish', pol.Name, prop, action, 'antiPhishPolicies')];
    if (/quarantine/i.test(action)) { const q = quarantineWords(cfg, pol[tagProp]); add('Anti-phishing: impersonation', `"${pol.Name}" applies (${pick.via}). It sees ${words}. The action is Quarantine; ${q.words}.`, 'high', all, { objects }); end('Quarantined as impersonation', 'high', { where: 'Quarantine (phishing)' }); return true; }
    if (/delete/i.test(action)) { add('Anti-phishing: impersonation', `"${pol.Name}" applies (${pick.via}). It sees ${words}. The action is Delete.`, 'high', all, { objects }); end('Deleted as impersonation', 'high', { where: 'Deleted' }); return true; }
    if (/movetojmf/i.test(action)) fate.where = 'Junk Email folder';
    add('Anti-phishing: impersonation', `"${pol.Name}" applies (${pick.via}). It sees ${words}. The action is ${action}${/movetojmf/i.test(action) ? ': moved to the Junk Email folder' : /noaction/i.test(action) ? ', so nothing happens except a safety tip if those are on' : ''}.`, 'medium', all, { objects });
    return false;
  }

  function safeAttachments(box) {
    if (!msg.attachments.length) return false;
    const pick = pickPolicy(cfg, { policies: 'safeAttachmentPolicies', rules: 'safeAttachmentRules', policyKey: 'SafeAttachmentPolicy', presetRules: 'presetAtpRules', builtIn: true, party: box });
    const pol = pick.policy;
    if (!pol || (pol.Enable === false || pol.Enable === 'False')) { add('Safe Attachments', `No Safe Attachments policy covers ${box.address}${pol ? ` ("${pol.Name}" is turned off)` : ''}, so attachments are not opened in a sandbox. This needs Defender for Office 365.`, 'info'); return false; }
    const action = str(pol.Action || 'Block');
    const objects = [{ kind: 'safeAttachments', name: pol.Name }];
    if (msg.malware && !/allow|off/i.test(action)) {
      add('Safe Attachments', `"${pol.Name}" applies (${pick.via}) and opens the attachments in a sandbox first; the malicious one is caught and the message is quarantined (action ${action}).`, 'high', [set('safeAttachments', pol.Name, 'Action', action, 'safeAttachmentPolicies')], { objects });
      end('Quarantined by Safe Attachments', 'high', { where: 'Quarantine (malware)' });
      return true;
    }
    add('Safe Attachments', `"${pol.Name}" applies (${pick.via}). Action ${action}: ${/dynamicdelivery/i.test(action) ? 'the body is delivered at once with placeholder attachments, which are swapped in after the scan' : /monitor/i.test(action) ? 'delivered at once; a bad attachment is only reported' : 'delivery waits for the sandbox scan, usually under a few minutes'}. No attachment was marked as malware.`, 'ok', [set('safeAttachments', pol.Name, 'Action', action, 'safeAttachmentPolicies')], { objects });
    return false;
  }

  function safeLinks(box) {
    const urls = urlsOf(msg);
    if (!urls.length) return false;
    const blocked = urls.map(u => ({ u, e: items(cfg, 'tenantAllowBlockUrls').find(i => /block/i.test(str(i.Action)) && urlMatches(u, i.Value)) })).find(x => x.e);
    if (blocked) {
      add('Tenant Allow/Block List: URL', `${blocked.u} matches the blocked URL entry ${blocked.e.Value}, so the message is marked as high confidence phishing.`, 'high', [set('tenantAllowBlock', blocked.e.Value, 'Action', 'Block', 'tenantAllowBlockUrls')], { objects: [{ kind: 'tenantAllowBlock', name: blocked.e.Value }] });
      const sp = pickPolicy(cfg, { policies: 'antiSpamPolicies', rules: 'antiSpamRules', policyKey: 'HostedContentFilterPolicy', party: box });
      msg.forcedVerdict = `blocked URL ${blocked.e.Value}`;
      if (sp.policy && verdictAction(sp.policy, sp, 'HighConfidencePhishAction', 'high confidence phishing', 'HighConfidencePhishQuarantineTag')) return true;
    }
    const pick = pickPolicy(cfg, { policies: 'safeLinksPolicies', rules: 'safeLinksRules', policyKey: 'SafeLinksPolicy', presetRules: 'presetAtpRules', builtIn: true, party: box });
    const pol = pick.policy;
    if (!pol || pol.EnableSafeLinksForEmail === false || pol.EnableSafeLinksForEmail === 'False') { add('Safe Links', `${urls.length} link${urls.length > 1 ? 's' : ''} in the message. No Safe Links policy covers ${box.address} for email${pol ? ` ("${pol.Name}" has it off)` : ''}, so links are not rewritten or checked at click time.`, 'info'); return false; }
    const skip = urls.filter(u => list(pol.DoNotRewriteUrls).some(p => urlMatches(u, p)));
    add('Safe Links', `"${pol.Name}" applies (${pick.via}). ${urls.length} link${urls.length > 1 ? 's are' : ' is'} ${bool(pol.DisableUrlRewrite) ? 'checked at click time without being rewritten' : 'rewritten and checked at click time'}${skip.length ? `, except ${skip.join(', ')} (in the do-not-rewrite list)` : ''}.${bool(pol.AllowClickThrough) ? ' People can click through a warning page to the original site.' : ''}`, bool(pol.AllowClickThrough) ? 'medium' : 'ok', [set('safeLinks', pol.Name, 'EnableSafeLinksForEmail', 'True', 'safeLinksPolicies')], { objects: [{ kind: 'safeLinks', name: pol.Name }] });
    return false;
  }

  function journal() {
    if (missing('journalRules', 'Journal rules')) return;
    const rules = items(cfg, 'journalRules').filter(r => r.Enabled !== false && r.Enabled !== 'False');
    const hits = rules.filter(r => {
      const scope = lc(r.Scope || 'Global');
      const external = !inOrg(msg.from, org) || !inOrg(msg.to, org);
      if (scope === 'internal' && external) return false;
      if (scope === 'external' && !external) return false;
      if (nonEmpty(r.Recipient)) return [msg.from, msg.to].some(p => namesParty(r.Recipient, p) || memberOfAny(r.Recipient, p));
      return true;
    });
    for (const r of hits) {
      copies.push({ to: str(r.JournalEmailAddress), why: `journal report, rule "${r.Name}"` });
      add('Journaling', `Journal rule "${r.Name}" (scope ${r.Scope || 'Global'}${nonEmpty(r.Recipient) ? `, for ${r.Recipient}` : ''}) sends a journal report with a copy of the message to ${r.JournalEmailAddress}. The sender and recipient do not see it.`, 'info', [set('journalRule', r.Name, 'JournalEmailAddress', r.JournalEmailAddress, 'journalRules')], { objects: [{ kind: 'journalRule', name: r.Name }] });
    }
    if (!hits.length && rules.length) add('Journaling', `${rules.length} journal rule${rules.length > 1 ? 's' : ''}, none for this message.`, 'ok');
  }

  function externalTag() {
    const tag = items(cfg, 'externalInOutlook')[0];
    if (!tag) return;
    const allow = list(tag.AllowList).map(lc);
    if (bool(tag.Enabled) && !allow.includes(msg.external.address) && !allow.includes(domainOf(msg.external.address))) add('Outlook external tag', 'Outlook shows an "External" tag on the message, because the external sender identification setting is on.', 'info', [set('externalTag', 'External in Outlook', 'Enabled', 'True', 'externalInOutlook')], { objects: [{ kind: 'externalTag', name: 'External in Outlook' }] });
  }

  function retention() {
    const box = org.mailbox.raw || {};
    const lines = []; const settings = []; const objects = [];
    const purview = items(cfg, 'retentionPolicies').filter(p => p.Enabled !== false && (list(p.ExchangeLocation).map(x => lc(typeof x === 'object' ? x.Name : x)).some(x => x === 'all' || org.mailbox.addresses.includes(x))));
    for (const p of purview) {
      const r = items(cfg, 'retentionRules').find(x => lc(x.Policy || x.ParentPolicyName) === lc(p.Name));
      const days = daysOf(r?.RetentionDuration);
      lines.push(`Purview retention "${p.Name}" keeps it for ${durationWords(days)}${/delete/i.test(str(r?.RetentionComplianceAction)) ? ', then deletes it' : ''}`);
      settings.push(set('retention', p.Name, 'RetentionDuration', days == null ? 'Unlimited' : `${days} days`, 'retentionRules')); objects.push({ kind: 'retention', name: p.Name });
    }
    if (box.RetentionPolicy) {
      const pol = items(cfg, 'mrmRetentionPolicies').find(x => lc(x.Name) === lc(box.RetentionPolicy));
      const tags = list(pol?.RetentionPolicyTagLinks).map(t => items(cfg, 'mrmRetentionTags').find(x => lc(x.Name) === lc(t))).filter(t => t && /^(all|inbox)$/i.test(str(t.Type)));
      const words = tags.map(t => `${t.Name}: ${/archive/i.test(str(t.RetentionAction)) ? 'moves to the archive' : 'deletes'} after ${durationWords(daysOf(t.AgeLimitForRetention))}`);
      lines.push(`Exchange retention policy "${box.RetentionPolicy}"${words.length ? ` (${words.join('; ')})` : ''}`);
      settings.push(set('mrmPolicy', box.RetentionPolicy, 'RetentionPolicy', box.RetentionPolicy, 'mailbox')); objects.push({ kind: 'mrmPolicy', name: box.RetentionPolicy });
    }
    if (bool(box.LitigationHoldEnabled)) { lines.push(`the mailbox is on litigation hold${box.LitigationHoldDuration && !/unlimited/i.test(str(box.LitigationHoldDuration)) ? ` for ${box.LitigationHoldDuration}` : ''}, so nothing can be purged`); settings.push(set('mailbox', org.mailbox.primary, 'LitigationHoldEnabled', 'True', 'mailbox')); }
    const holds = items(cfg, 'caseHoldPolicies').filter(h => h.Enabled !== false && list(h.ExchangeLocation).map(x => lc(typeof x === 'object' ? x.Name : x)).some(x => org.mailbox.addresses.includes(x)));
    for (const h of holds) { lines.push(`eDiscovery hold "${h.Name}"${h.CaseId || h.Case ? ` in case ${items(cfg, 'complianceCases').find(c => lc(c.Identity || c.Guid) === lc(h.CaseId))?.Name || h.Case || h.CaseId}` : ''} keeps a copy even if it is deleted`); settings.push(set('ediscovery', h.Name, 'ExchangeLocation', org.mailbox.primary, 'caseHoldPolicies')); objects.push({ kind: 'ediscovery', name: h.Name }); }
    if (lines.length) add('Retention and holds', `After delivery: ${lines.join('; ')}. These never stop delivery; they decide how long the message is kept.`, 'info', settings, { objects });
  }

  function mailboxStage() {
    const box = org.mailbox.raw || {};
    const ext = msg.external;
    // Junk email settings in the mailbox (Outlook safe and blocked senders)
    const junk = items(cfg, 'junkEmailConfig')[0];
    if (junk && bool(junk.Enabled ?? true)) {
      const trusted = list(junk.TrustedSendersAndDomains).map(lc);
      const blocked = list(junk.BlockedSendersAndDomains).map(lc);
      const hit = x => x.includes(ext.address) || x.includes(domainOf(ext.address));
      if (fate.where === 'Junk Email folder' && hit(trusted) && msg.auth === 'pass') { fate.where = 'Inbox'; add('Mailbox junk email settings', `${ext.address} is on ${org.mailbox.primary}'s Safe Senders list, so the message goes to the Inbox instead of Junk Email.`, 'medium', [set('mailbox', org.mailbox.primary, 'TrustedSendersAndDomains', domainOf(ext.address), 'junkEmailConfig')]); }
      else if (hit(blocked)) { fate.where = 'Junk Email folder'; add('Mailbox junk email settings', `${ext.address} is on ${org.mailbox.primary}'s Blocked Senders list, so the message goes to Junk Email.`, 'medium', [set('mailbox', org.mailbox.primary, 'BlockedSendersAndDomains', ext.address, 'junkEmailConfig')]); }
    }
    // Inbox rules
    const rules = items(cfg, 'inboxRules').filter(r => r.Enabled !== false && r.Enabled !== 'False').sort((a, b) => Number(a.Priority ?? 99) - Number(b.Priority ?? 99));
    const forwards = [];
    for (const r of rules) {
      const reasons = []; let fail = false;
      const t = (k, ok, words) => { if (nonEmpty(r[k])) { if (ok) reasons.push(words); else fail = true; } };
      t('From', namesParty(r.From, ext), `it is from ${ext.address}`);
      t('FromAddressContainsWords', list(r.FromAddressContainsWords).some(w => ext.address.includes(lc(w))), 'the sender address matches');
      t('SubjectContainsWords', firstWord(msg.subject, r.SubjectContainsWords), `the subject contains "${firstWord(msg.subject, r.SubjectContainsWords)}"`);
      t('BodyContainsWords', firstWord(msg.body, r.BodyContainsWords), `the body contains "${firstWord(msg.body, r.BodyContainsWords)}"`);
      t('SubjectOrBodyContainsWords', firstWord(`${msg.subject}\n${msg.body}`, r.SubjectOrBodyContainsWords), `the subject or body contains "${firstWord(`${msg.subject}\n${msg.body}`, r.SubjectOrBodyContainsWords)}"`);
      if (bool(r.HasAttachment)) { if (msg.attachments.length) reasons.push('it has an attachment'); else fail = true; }
      if (fail || (!reasons.length && !bool(r.FromAddressContainsWords))) continue;
      const acts = [];
      const fwd = [...list(r.ForwardTo), ...list(r.RedirectTo), ...list(r.ForwardAsAttachmentTo)].map(addressOf).filter(Boolean);
      if (fwd.length) { acts.push(`${nonEmpty(r.RedirectTo) ? 'redirects' : 'forwards'} it to ${fwd.join(', ')}`); forwards.push(...fwd.map(a => ({ to: a, by: `inbox rule "${r.Name}"`, kind: 'inboxRule', name: r.Name, prop: nonEmpty(r.RedirectTo) ? 'RedirectTo' : 'ForwardTo' }))); }
      if (nonEmpty(r.MoveToFolder)) { acts.push(`moves it to ${str(r.MoveToFolder).split(':').pop().replace(/^\\/, '')}`); if (fate.where === 'Inbox') fate.where = str(r.MoveToFolder).split(':').pop().replace(/^\\/, ''); }
      if (bool(r.DeleteMessage)) { acts.push('deletes it (Deleted Items)'); fate.where = 'Deleted Items'; }
      if (bool(r.MarkAsRead)) acts.push('marks it as read');
      add('Inbox rule', `"${r.Name}" in ${org.mailbox.primary} matches because ${reasons.join(' and ')}. It ${acts.join(', ') || 'does nothing NextHop recognises'}.`, fwd.length ? 'medium' : 'info', [set('inboxRule', r.Name, fwd.length ? (nonEmpty(r.RedirectTo) ? 'RedirectTo' : 'ForwardTo') : 'Actions', fwd.length ? fwd : acts, 'inboxRules')], { objects: [{ kind: 'inboxRule', name: r.Name }] });
      if (bool(r.StopProcessingRules)) break;
    }
    // Mailbox forwarding
    const fwdAddr = addressOf(box.ForwardingSmtpAddress) || addressOf(box.ForwardingAddress);
    if (fwdAddr) {
      forwards.unshift({ to: fwdAddr, by: 'mailbox forwarding', kind: 'mailbox', name: org.mailbox.primary, prop: box.ForwardingSmtpAddress ? 'ForwardingSmtpAddress' : 'ForwardingAddress' });
      add('Mailbox forwarding', `${org.mailbox.primary} forwards all mail to ${fwdAddr}${bool(box.DeliverToMailboxAndForward) ? ' and keeps a copy' : ' without keeping a copy'}.`, 'medium', [set('mailbox', org.mailbox.primary, box.ForwardingSmtpAddress ? 'ForwardingSmtpAddress' : 'ForwardingAddress', fwdAddr, 'mailbox'), set('mailbox', org.mailbox.primary, 'DeliverToMailboxAndForward', bool(box.DeliverToMailboxAndForward) ? 'True' : 'False', 'mailbox')], { objects: [{ kind: 'mailbox', name: org.mailbox.primary }] });
      if (!bool(box.DeliverToMailboxAndForward) && !fate.done) fate.where = `Not kept: forwarded to ${fwdAddr}`;
    }
    // Each forward to outside is a new outbound automatic forward.
    for (const f of forwards) {
      const d = domainOf(f.to);
      if (org.isAccepted(d)) { add('Forward', `The ${f.by} copy to ${f.to} stays inside the organization.`, 'info'); continue; }
      const ob = pickPolicy(cfg, { policies: 'outboundSpamPolicies', rules: 'outboundSpamRules', policyKey: 'HostedOutboundSpamFilterPolicy', presetRules: null, party: msg.internal, direction: 'sender' });
      const mode = str(ob.policy?.AutoForwardingMode || 'Automatic');
      const rd = remoteDomainFor(d);
      const objects = [{ kind: f.kind, name: f.name }, ...(ob.policy ? [{ kind: 'outbound', name: ob.policy.Name }] : []), ...(rd ? [{ kind: 'remoteDomain', name: rd.Name }] : [])];
      if (!/^on$/i.test(mode)) {
        add('Forward to outside: blocked', `The ${f.by} forward to ${f.to} is an automatic forward to outside. Outbound spam policy "${ob.policy?.Name || 'Default'}" has automatic forwarding ${mode}${/automatic/i.test(mode) ? ' (now means Off)' : ''}, so it is blocked and ${org.mailbox.primary} gets an NDR (550 5.7.520). The original is still delivered.`, 'high', [set(f.kind, f.name, f.prop, f.to, f.kind === 'mailbox' ? 'mailbox' : 'inboxRules'), set('outbound', ob.policy?.Name || 'Default', 'AutoForwardingMode', mode, 'outboundSpamPolicies')], { objects });
        notes.push(`The forward to ${f.to} is blocked (550 5.7.520).`);
      } else if (rd && rd.AutoForwardEnabled != null && !bool(rd.AutoForwardEnabled)) {
        add('Forward to outside: dropped', `The ${f.by} forward to ${f.to} is allowed by outbound spam policy "${ob.policy?.Name}", but remote domain "${rd.Name}" (${rd.DomainName}) does not allow automatic forwards, so Exchange drops it.`, 'high', [set('remoteDomain', rd.Name, 'AutoForwardEnabled', 'False', 'remoteDomains')], { objects });
        notes.push(`The forward to ${f.to} is dropped by remote domain "${rd.Name}".`);
      } else {
        add('Forward to outside: allowed', `The ${f.by} forward to ${f.to} leaves the organization: outbound spam policy "${ob.policy?.Name}" has automatic forwarding On${rd ? ` and remote domain "${rd.Name}" allows it` : ''}. Company mail now sits in an outside mailbox.`, 'high', [set('outbound', ob.policy?.Name, 'AutoForwardingMode', mode, 'outboundSpamPolicies')], { objects });
        copies.push({ to: f.to, why: `automatic forward (${f.by})` });
      }
    }
    // Automatic reply
    const oof = items(cfg, 'autoReply')[0];
    if (oof && /enabled|scheduled/i.test(str(oof.AutoReplyState))) {
      const rd = remoteDomainFor(domainOf(msg.external.address));
      const aud = str(oof.ExternalAudience || 'None');
      if (/none/i.test(aud)) add('Automatic reply', `${org.mailbox.primary} has automatic replies on, but not for outside senders.`, 'info');
      else if (rd && rd.AutoReplyEnabled != null && !bool(rd.AutoReplyEnabled)) add('Automatic reply', `${org.mailbox.primary} has automatic replies on for outside senders, but remote domain "${rd.Name}" blocks automatic replies, so none is sent.`, 'info', [set('remoteDomain', rd.Name, 'AutoReplyEnabled', 'False', 'remoteDomains')], { objects: [{ kind: 'remoteDomain', name: rd.Name }] });
      else add('Automatic reply', `${org.mailbox.primary} sends its out-of-office reply to ${msg.external.address} (external audience: ${aud}).`, 'info', [set('mailbox', org.mailbox.primary, 'ExternalAudience', aud, 'autoReply')]);
    }
    end(fate.where === 'Inbox' ? 'Delivered to the Inbox' : /^Not kept/.test(fate.where) ? `Delivered, then forwarded (${fate.where.replace(/^Not kept: /, '')})` : `Delivered to ${fate.where}`, fate.where === 'Inbox' ? 'ok' : 'medium');
  }

  function remoteDomainFor(domain) {
    const all = items(cfg, 'remoteDomains');
    const specific = all.filter(r => str(r.DomainName) !== '*' && domainMatches(domain, r.DomainName)).sort((a, b) => str(b.DomainName).length - str(a.DomainName).length)[0];
    return specific || all.find(r => str(r.DomainName) === '*') || null;
  }

  function autoLabel() {
    const pols = items(cfg, 'autoLabelPolicies').filter(p => p.Enabled !== false && list(p.ExchangeLocation).length && list(p.ExchangeLocation).map(x => lc(typeof x === 'object' ? x.Name : x)).some(x => x === 'all' || msg.internal.addresses.includes(x)));
    for (const p of pols) {
      const rules = items(cfg, 'autoLabelRules').filter(r => lc(r.ParentPolicyName || r.Policy) === lc(p.Name) && !bool(r.Disabled));
      for (const r of rules) {
        const m = matchSits(sitRefs(r.ContentContainsSensitiveInformation), textOf(msg), cfg);
        if (!m.matched.length) { if (m.unknown.length) unknowns.push(`Auto-labeling rule "${r.Name}" looks for ${m.unknown.join(', ')}, which NextHop cannot detect.`); continue; }
        const labelRef = str(p.ApplySensitivityLabel);
        const lab = items(cfg, 'sensitivityLabels').find(l => [l.Guid, l.ImmutableId, l.Name, l.DisplayName].map(lc).includes(lc(labelRef)));
        const name = lab?.DisplayName || lab?.Name || labelRef;
        const objects = [{ kind: 'autoLabel', name: p.Name }, ...(lab ? [{ kind: 'label', name }] : [])];
        const settings = [set('autoLabel', p.Name, 'Mode', p.Mode || 'Enable', 'autoLabelPolicies'), set('autoLabel', `${p.Name} > ${r.Name}`, 'ContentContainsSensitiveInformation', m.matched.map(x => x.name), 'autoLabelRules'), set('label', name, 'EncryptionEnabled', bool(lab?.EncryptionEnabled) ? 'True' : 'False', 'sensitivityLabels')];
        if (/^test/i.test(str(p.Mode))) { add('Auto-labeling (simulation)', `"${p.Name}" would label the message "${name}" because it contains ${m.matched.map(x => x.name).join(', ')}, but the policy is in simulation (${p.Mode}), so no label is applied.`, 'medium', settings, { objects }); continue; }
        if (msg.label) { add('Auto-labeling', `"${p.Name}" matches (${m.matched.map(x => x.name).join(', ')}), but the sender already applied a label, and auto-labeling in Exchange does not replace a label the user chose.`, 'info', settings, { objects }); continue; }
        if (bool(lab?.EncryptionEnabled)) fate.encrypted = true;
        add('Auto-labeling', `"${p.Name}" labels the message "${name}" in transit because it contains ${m.matched.map(x => x.name).join(', ')}.${bool(lab?.EncryptionEnabled) ? ' The label encrypts, so the outside recipient gets an encrypted message.' : ''}`, 'info', settings, { objects });
        return;
      }
    }
  }

  function remoteDomain(domain) {
    if (missing('remoteDomains', 'Remote domains')) return false;
    const rd = remoteDomainFor(domain);
    if (!rd) { add('Remote domain', `No remote domain (not even Default) is in the export for ${domain}.`, 'medium'); return false; }
    const objects = [{ kind: 'remoteDomain', name: rd.Name }];
    const which = str(rd.DomainName) === '*' ? `the Default remote domain (*), because no remote domain names ${domain}` : `remote domain "${rd.Name}" (${rd.DomainName})`;
    if (msg.kind === 'autoforward' && rd.AutoForwardEnabled != null && !bool(rd.AutoForwardEnabled)) { add('Remote domain', `Mail to ${domain} uses ${which}, which does not allow automatic forwards, so Exchange drops the message. The sender is not told.`, 'high', [set('remoteDomain', rd.Name, 'AutoForwardEnabled', 'False', 'remoteDomains')], { objects }); end(`Dropped: remote domain "${rd.Name}" blocks automatic forwards`, 'high', { where: 'Dropped' }); return true; }
    if (msg.kind === 'autoreply' && rd.AutoReplyEnabled != null && !bool(rd.AutoReplyEnabled)) { add('Remote domain', `Mail to ${domain} uses ${which}, which does not allow automatic replies, so the reply is not sent.`, 'medium', [set('remoteDomain', rd.Name, 'AutoReplyEnabled', 'False', 'remoteDomains')], { objects }); end(`Not sent: remote domain "${rd.Name}" blocks automatic replies`, 'medium', { where: 'Dropped' }); return true; }
    const tnef = rd.TNEFEnabled == null ? 'decided by Outlook' : bool(rd.TNEFEnabled) ? 'always' : 'never';
    add('Remote domain', `Mail to ${domain} uses ${which}. Message format: ${rd.ContentType || 'MimeHtmlText'}; rich text (TNEF): ${tnef}; automatic replies ${rd.AutoReplyEnabled == null || bool(rd.AutoReplyEnabled) ? 'allowed' : 'blocked'}; automatic forwards ${rd.AutoForwardEnabled == null || bool(rd.AutoForwardEnabled) ? 'allowed' : 'blocked'}.`, 'ok', [set('remoteDomain', rd.Name, 'DomainName', rd.DomainName, 'remoteDomains')], { objects });
    return false;
  }

  function dkim() {
    const d = domainOf(msg.from.address);
    const conf = items(cfg, 'dkimSigningConfig').find(x => lc(x.Domain || x.Name) === d);
    if (conf && bool(conf.Enabled)) add('DKIM signing', `Exchange Online signs the message with DKIM for ${d} (selector ${str(conf.SelectorBeforeRotateOnDate || 'selector1').replace(/^$/, 'selector1')}).`, 'ok', [set('dkim', d, 'Enabled', 'True', 'dkimSigningConfig')], { objects: [{ kind: 'dkim', name: d }] });
    else add('DKIM signing', `DKIM signing for ${d} is ${conf ? 'off' : 'not in the export'}, so the message is signed only with the tenant's ${org.domains.find(x => /onmicrosoft\.com$/.test(x.name))?.name || 'onmicrosoft.com'} key, which does not align with ${d} for DMARC.`, 'medium', [set('dkim', d, 'Enabled', conf ? 'False' : 'not configured', 'dkimSigningConfig')], { objects: [{ kind: 'dkim', name: d }] });
  }

  function connectorOut(domain) {
    missing('outboundConnectors', 'Outbound connectors');
    const conns = items(cfg, 'outboundConnectors').filter(enabledRule);
    let conn = null; let why = '';
    if (msg.forcedConnector) {
      conn = conns.find(c => lc(c.Name) === lc(msg.forcedConnector));
      why = `mail flow rule "${msg.forcedBy}" routes it there`;
      if (!conn) { add('Outbound connector', `Mail flow rule "${msg.forcedBy}" routes to connector "${msg.forcedConnector}", which is not in the export or is turned off. Exchange Online would hold the message and retry, then send an NDR.`, 'high'); end(`Stuck: the connector "${msg.forcedConnector}" named by a rule is missing`, 'high', { ndr: '550 5.4.316' }); return; }
    } else {
      const scoped = conns.filter(c => !bool(c.IsTransportRuleScoped));
      conn = scoped.filter(c => list(c.RecipientDomains).some(p => connectorDomain(p) !== '*' && domainMatches(domain, p))).sort((a, b) => Math.max(...list(b.RecipientDomains).map(x => str(x).length)) - Math.max(...list(a.RecipientDomains).map(x => str(x).length)))[0]
        || scoped.find(c => list(c.RecipientDomains).some(p => connectorDomain(p) === '*'));
      if (conn) why = `${domain} matches its recipient domains (${list(conn.RecipientDomains).join(', ')})`;
      const ruleOnly = conns.filter(c => bool(c.IsTransportRuleScoped) && list(c.RecipientDomains).some(p => domainMatches(domain, p)));
      if (!conn && ruleOnly.length) add('Outbound connector', `"${ruleOnly[0].Name}" covers ${domain} (recipient domains ${list(ruleOnly[0].RecipientDomains).join(', ')}), but it is scoped to mail flow rules only, and no rule routed this message to it.`, 'info', [set('connector', ruleOnly[0].Name, 'IsTransportRuleScoped', 'True', 'outboundConnectors')], { objects: [{ kind: 'connector', name: ruleOnly[0].Name }] });
    }
    if (conn) {
      const hosts = list(conn.SmartHosts);
      const tls = str(conn.TlsSettings || '');
      const tlsWords = /domainvalidation/i.test(tls) ? `TLS is required and the certificate must name ${conn.TlsDomain || domain}` : /certificatevalidation/i.test(tls) ? 'TLS is required with a trusted certificate' : /encryptiononly/i.test(tls) ? 'TLS is required (any certificate)' : 'TLS is used when the other side offers it';
      add('Outbound connector', `Sent through "${conn.Name}" because ${why}. It ${bool(conn.UseMXRecord) || !hosts.length ? `delivers to the MX record of ${domain} (NextHop does not look it up)` : `delivers to the smart host${hosts.length > 1 ? 's' : ''} ${hosts.join(', ')}`}; ${tlsWords}.`, 'info', [set('connector', conn.Name, 'RecipientDomains', conn.RecipientDomains, 'outboundConnectors'), set('connector', conn.Name, 'TlsSettings', tls || 'None (opportunistic)', 'outboundConnectors'), ...(hosts.length ? [set('connector', conn.Name, 'SmartHosts', hosts, 'outboundConnectors')] : [])], { objects: [{ kind: 'connector', name: conn.Name }] });
    } else add('Outbound delivery', `No outbound connector covers ${domain}, so Exchange Online looks up the MX record of ${domain} and delivers there with opportunistic TLS${msg.requireTls ? ' (a mail flow rule requires TLS, so it will not fall back to plain text)' : ''}. NextHop does not do the DNS lookup.`, 'ok');
    if (fate.override) end(`Sent to ${msg.external.address} only if the sender overrides the DLP policy tip (${fate.override}); otherwise blocked (550 5.7.1)`, 'medium', { where: 'Left Exchange Online' });
    else end(`Sent to ${msg.external.address}${fate.encrypted ? ' (encrypted)' : ''}`, 'ok', { where: 'Left Exchange Online' });
  }

  // -------------------------------------------------------------------------------------------------------------
  function finish() {
    const outcome = fate.outcome || 'No prediction';
    return {
      direction: msg.direction,
      message: { from: msg.from.address, fromName: msg.from.displayName, to: msg.to.address, subject: msg.subject, originalSubject: str(input?.subject), ip: msg.ip, attachments: msg.attachments, sizeBytes: msg.sizeBytes, auth: msg.auth, verdict: msg.verdict, bcl: msg.bcl, malware: msg.malware, kind: msg.kind, label: msg.label, body: msg.body },
      outcome, tone: fate.tone, where: fate.where, ndr: fate.ndr, encrypted: fate.encrypted,
      steps: steps.map((s, i) => ({ ...s, n: i + 1 })),
      copies, unknowns, notes,
      settings: steps.flatMap((s, i) => s.settings.map(x => ({ step: i + 1, component: s.component, ...x }))),
      source: cfg?.sample ? 'sample' : 'export',
      tenant: cfg?.tenant?.organization || org.name || '',
      generatedAt: cfg?.generatedAt || null,
    };
  }
}

// Look-alike domains: the same name with up to two letters changed, swapped, added or removed, or a digit for a letter.
function lookalike(a, b) {
  const x = a.split('.')[0]; const y = b.split('.')[0];
  if (x === y) return a !== b && a.split('.').slice(1).join('.') !== b.split('.').slice(1).join('.') && x.length > 3;
  const norm = s => s.replace(/0/g, 'o').replace(/1/g, 'l').replace(/rn/g, 'm').replace(/vv/g, 'w');
  if (norm(x) === norm(y)) return true;
  if (Math.abs(x.length - y.length) > 2 || y.length < 4) return false;
  const d = Array.from({ length: x.length + 1 }, (_, i) => [i, ...Array(y.length).fill(0)]);
  for (let j = 1; j <= y.length; j++) d[0][j] = j;
  for (let i = 1; i <= x.length; i++) for (let j = 1; j <= y.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
  return d[x.length][y.length] <= (y.length >= 7 ? 2 : 1);
}
export { lookalike };

function urlMatches(url, pattern) {
  const u = lc(url).replace(/^https?:\/\//, '');
  const p = lc(pattern).replace(/^https?:\/\//, '');
  if (!p) return false;
  const re = new RegExp(`^${p.split('*').map(escapeRe).join('.*')}${p.endsWith('*') || p.includes('/') ? '' : '(/.*)?'}$`);
  return re.test(u) || re.test(u.replace(/\/$/, ''));
}
export { urlMatches };

// Plain text, one line per step, for a ticket or chat.
export function nextHopText(result) {
  const head = [`NextHop prediction (${result.direction}): ${result.outcome}`, `${result.message.from} to ${result.message.to}. Subject: ${result.message.originalSubject || '(none)'}`, result.source === 'sample' ? 'Configuration: Contoso sample topology (fictional).' : `Configuration: export of ${result.tenant || 'a tenant'}${result.generatedAt ? `, ${String(result.generatedAt).slice(0, 10)}` : ''}.`, ''];
  const lines = result.steps.map(s => `${s.n}. ${s.component}: ${s.text}`);
  const tail = [];
  if (result.copies.length) tail.push('', 'Copies:', ...result.copies.map(c => `- ${c.to} (${c.why})`));
  if (result.unknowns.length) tail.push('', 'Could not predict:', ...result.unknowns.map(u => `- ${u}`));
  return [...head, ...lines, ...tail].join('\n');
}

// What the configuration holds, one row per area, for the "Topology at a glance" table.
export const TOPOLOGY_AREAS = [
  ['organizationConfig', 'Organization settings'], ['transportConfig', 'Transport settings (size limits, journaling, TLS)'],
  ['acceptedDomains', 'Accepted domains'], ['remoteDomains', 'Remote domains'], ['dkimSigningConfig', 'DKIM signing'], ['arcConfig', 'Trusted ARC sealers'],
  ['inboundConnectors', 'Inbound connectors'], ['outboundConnectors', 'Outbound connectors'],
  ['connectionFilterPolicies', 'Connection filter'], ['tenantAllowBlockSenders', 'Tenant Allow/Block List: senders'], ['tenantAllowBlockIPs', 'Tenant Allow/Block List: IP addresses'],
  ['tenantAllowBlockSpoof', 'Tenant Allow/Block List: spoofed senders'], ['tenantAllowBlockUrls', 'Tenant Allow/Block List: URLs'], ['tenantAllowBlockFiles', 'Tenant Allow/Block List: files'],
  ['phishSimOverridePolicy', 'Advanced delivery: phishing simulations'], ['secOpsOverridePolicy', 'Advanced delivery: SecOps mailboxes'],
  ['presetEopRules', 'Preset security policies (EOP)'], ['presetAtpRules', 'Preset security policies (Defender)'], ['builtInProtectionRule', 'Built-in protection'],
  ['antiMalwarePolicies', 'Anti-malware policies'], ['transportRules', 'Mail flow rules'], ['dlpPolicies', 'DLP policies'], ['dlpRules', 'DLP rules'],
  ['antiPhishPolicies', 'Anti-phishing policies'], ['antiSpamPolicies', 'Anti-spam policies'], ['outboundSpamPolicies', 'Outbound spam policies'], ['quarantinePolicies', 'Quarantine policies'],
  ['safeAttachmentPolicies', 'Safe Attachments policies'], ['safeLinksPolicies', 'Safe Links policies'], ['journalRules', 'Journal rules'], ['externalInOutlook', 'External sender tag in Outlook'],
  ['sensitivityLabels', 'Sensitivity labels'], ['autoLabelPolicies', 'Auto-labeling policies'], ['omeConfiguration', 'Message encryption (OME)'], ['irmConfiguration', 'Rights management (IRM)'],
  ['retentionPolicies', 'Purview retention policies'], ['mrmRetentionPolicies', 'Exchange retention policies (MRM)'], ['caseHoldPolicies', 'eDiscovery holds'],
  ['mailbox', 'The mailbox (forwarding, size limits, delivery restrictions)'], ['mailboxStatistics', 'The mailbox: size and quota'], ['junkEmailConfig', 'The mailbox: junk email settings'],
  ['autoReply', 'The mailbox: automatic replies'], ['inboxRules', 'The mailbox: inbox rules'], ['mailboxMemberOf', 'Groups the mailbox is in'],
];
// The object-links.js kind for each area, so every name in the table opens that object (or its portal list).
export const TOPOLOGY_KINDS = {
  organizationConfig: '', transportConfig: 'transportConfig', acceptedDomains: 'domain', remoteDomains: 'remoteDomain', dkimSigningConfig: 'dkim', arcConfig: '',
  inboundConnectors: 'connector', outboundConnectors: 'connector', connectionFilterPolicies: 'connectionFilter',
  tenantAllowBlockSenders: 'tenantAllowBlock', tenantAllowBlockIPs: 'tenantAllowBlock', tenantAllowBlockSpoof: 'tenantAllowBlock', tenantAllowBlockUrls: 'tenantAllowBlock', tenantAllowBlockFiles: 'tenantAllowBlock',
  phishSimOverridePolicy: 'advancedDelivery', secOpsOverridePolicy: 'advancedDelivery', presetEopRules: 'presetPolicy', presetAtpRules: 'presetPolicy', builtInProtectionRule: 'presetPolicy',
  antiMalwarePolicies: 'antiMalware', transportRules: 'transportRule', dlpPolicies: 'dlp', dlpRules: 'dlp',
  antiPhishPolicies: 'antiPhish', antiSpamPolicies: 'antiSpam', outboundSpamPolicies: 'outbound', quarantinePolicies: 'quarantinePolicy',
  safeAttachmentPolicies: 'safeAttachments', safeLinksPolicies: 'safeLinks', journalRules: 'journalRule', externalInOutlook: 'externalTag',
  sensitivityLabels: 'label', autoLabelPolicies: 'autoLabel', omeConfiguration: '', irmConfiguration: '',
  retentionPolicies: 'retention', mrmRetentionPolicies: 'mrmPolicy', caseHoldPolicies: 'ediscovery',
  mailbox: 'mailbox', mailboxStatistics: 'mailbox', junkEmailConfig: 'mailbox', autoReply: 'mailbox', inboxRules: 'inboxRule', mailboxMemberOf: 'group',
};
// The same areas laid out along the path a message travels, one path inbound and one outbound, for "Topology at a
// glance". Each stage is a stop on the path; each area is a box at the stop where it acts. An area can sit on both
// paths (mail flow rules, DLP, anti-malware, journaling, the mailbox). The boxes are fixed: an empty area still has
// its box. The last stop holds settings that apply at several steps.
const ORG_WIDE = ['organizationConfig', 'transportConfig', 'presetEopRules', 'presetAtpRules', 'builtInProtectionRule', 'omeConfiguration', 'irmConfiguration'];
export const TOPOLOGY_PATHS = {
  inbound: [
    { id: 'arrive', title: 'Arrives at Exchange Online', keys: ['acceptedDomains', 'arcConfig'] },
    { id: 'connection', title: 'Connection: connectors and IP checks', keys: ['inboundConnectors', 'connectionFilterPolicies', 'tenantAllowBlockIPs', 'tenantAllowBlockSenders', 'tenantAllowBlockSpoof', 'phishSimOverridePolicy', 'secOpsOverridePolicy'] },
    { id: 'malware', title: 'Anti-malware', keys: ['antiMalwarePolicies', 'tenantAllowBlockFiles'] },
    { id: 'rules', title: 'Mail flow rules and DLP', keys: ['transportRules', 'dlpPolicies', 'dlpRules'] },
    { id: 'spam', title: 'Anti-phishing and anti-spam', keys: ['antiPhishPolicies', 'antiSpamPolicies', 'quarantinePolicies'] },
    { id: 'after', title: 'Safe Attachments and Safe Links', keys: ['safeAttachmentPolicies', 'safeLinksPolicies', 'tenantAllowBlockUrls'] },
    { id: 'stamp', title: 'Journaling, labels and tags', keys: ['journalRules', 'externalInOutlook', 'sensitivityLabels', 'autoLabelPolicies'] },
    { id: 'mailbox', title: 'The recipient mailbox', keys: ['mailbox', 'mailboxStatistics', 'junkEmailConfig', 'inboxRules', 'autoReply', 'mailboxMemberOf', 'retentionPolicies', 'mrmRetentionPolicies', 'caseHoldPolicies'] },
    { id: 'org', title: 'Organization-wide (several steps)', keys: ORG_WIDE },
  ],
  outbound: [
    { id: 'mailbox', title: 'The sender mailbox', keys: ['mailbox', 'mailboxMemberOf', 'inboxRules', 'autoReply', 'sensitivityLabels'] },
    { id: 'spam', title: 'Outbound spam', keys: ['outboundSpamPolicies'] },
    { id: 'malware', title: 'Anti-malware', keys: ['antiMalwarePolicies', 'tenantAllowBlockFiles'] },
    { id: 'rules', title: 'Mail flow rules and DLP', keys: ['transportRules', 'dlpPolicies', 'dlpRules', 'autoLabelPolicies'] },
    { id: 'journal', title: 'Journaling', keys: ['journalRules'] },
    { id: 'remote', title: 'Remote domains', keys: ['remoteDomains'] },
    { id: 'dkim', title: 'DKIM signing', keys: ['dkimSigningConfig'] },
    { id: 'connector', title: 'Outbound connectors', keys: ['outboundConnectors'] },
    { id: 'org', title: 'Organization-wide (several steps)', keys: ORG_WIDE },
  ],
};
export function topologyStages(cfg, direction = 'inbound') {
  const rows = new Map(topologyRows(cfg).map(r => [r.key, r]));
  return (TOPOLOGY_PATHS[direction] || TOPOLOGY_PATHS.inbound).map(st => ({ ...st, rows: st.keys.map(k => rows.get(k)).filter(Boolean) }));
}

// Areas the export holds and the table shows, but the prediction does not use yet. Each can change what happens to
// a message: ARC trust changes composite authentication, a blocked file hash stops an attachment, OME and IRM decide
// encryption.
export const TOPOLOGY_NOT_PREDICTED = new Set(['arcConfig', 'omeConfiguration', 'irmConfiguration', 'tenantAllowBlockFiles']);
// What can change routing or delivery but is not in the export, so neither the table nor the prediction has it.
export const TOPOLOGY_OUTSIDE = [
  'DNS: MX, SPF, DKIM and DMARC records, and the outside domain\'s records (left out on purpose: the outside address is made up).',
  'Every recipient other than the exported mailbox: their forwarding, quotas, inbox rules and junk settings.',
  'Groups as recipients: membership expansion, moderation and who may send to them; mail-enabled public folders; mail contacts and mail users.',
  'Hybrid and on-premises Exchange: centralized mail transport, on-premises servers and their connectors.',
  'Microsoft\'s own service: IP reputation and throttling, Microsoft-wide block lists, zero-hour auto purge after delivery, and user-reported messages.',
];
export function topologyRows(cfg) {
  return TOPOLOGY_AREAS.map(([key, title]) => {
    const objects = items(cfg, key).map(i => ({ name: str(i.Name || i.DisplayName || i.DomainName || i.Domain || i.Value || i.PrimarySmtpAddress || i.Identity), id: str(i.ExternalDirectoryObjectId || i.Guid || ''), type: str(i.RecipientTypeDetails || '') })).filter(o => o.name);
    return { key, title, kind: TOPOLOGY_KINDS[key] || '', predicted: !TOPOLOGY_NOT_PREDICTED.has(key), status: sectionStatus(cfg, key), count: items(cfg, key).length, names: objects.map(o => o.name), objects };
  });
}

// Is this a file NextHop can read? Returns { ok, message }.
export function checkExport(cfg) {
  if (!cfg || typeof cfg !== 'object') return { ok: false, message: 'The file is not JSON.' };
  if (cfg.format !== NEXTHOP_FORMAT) return { ok: false, message: `The file's format is "${cfg.format ?? '(none)'}", not "${NEXTHOP_FORMAT}". Make it with export/Export-MailFlowConfig.ps1.` };
  if (cfg.version !== 1) return { ok: false, message: `The file is version ${cfg.version}; NextHop reads version 1.` };
  if (!cfg.sections || typeof cfg.sections !== 'object') return { ok: false, message: 'The file has no sections.' };
  if (!items(cfg, 'mailbox').length && !cfg.mailbox?.address) return { ok: false, message: 'The file has no mailbox. Run the export with -Mailbox <address>.' };
  return { ok: true, message: '' };
}

// Where each step's setting is configured: the object-links.js kinds whose portal pages change it, so every step can
// link straight to its admin page ("DLP is a specific place that can be linked to"). Matched on the
// step's component, longest prefix first; kinds from the step's own settings come first. Steps about the outside world
// or NextHop itself have none.
export const STEP_PORTAL_KINDS = [
  ['Exchange Online front door', ['domain']],
  ['Inbound connector', ['connector']], ['Outbound connector', ['connector']], ['Outbound delivery', ['connector']], ['Enhanced filtering', ['connector']],
  ['Message size limit', ['mailbox']], ['Mailbox quota', ['mailbox']], ['Recipient', ['mailbox']], ['Mailbox forwarding', ['mailbox']],
  ['Mailbox junk email settings', ['mailbox']], ['Automatic reply', ['mailbox']],
  ['Connection filter', ['connectionFilter']], ['Tenant Allow/Block List', ['tenantAllowBlock']], ['Advanced delivery', ['advancedDelivery']],
  ['Anti-malware', ['antiMalware']], ['Mail flow rule', ['transportRule']], ['Data loss prevention', ['dlp']],
  ['Anti-phishing', ['antiPhish']], ['Anti-spam', ['antiSpam']], ['Safe Attachments', ['safeAttachments']], ['Safe Links', ['safeLinks']],
  ['Journaling', ['journalRule']], ['Outlook external tag', ['externalTag']], ['Retention and holds', ['retention', 'mrmPolicy']],
  ['Inbox rule', ['inboxRule']], ['Forward to outside', ['outbound', 'remoteDomain']], ['Forward', ['inboxRule', 'mailbox']],
  ['Outbound spam', ['outbound']], ['Remote domain', ['remoteDomain']], ['DKIM signing', ['dkim']],
  ['Sensitivity label', ['label']], ['Auto-labeling', ['autoLabel']],
].sort((a, b) => b[0].length - a[0].length);

export function stepPortalKinds(step = {}) {
  const component = String(step.component || '');
  const out = [];
  const add = kind => { if (kind && !out.includes(kind)) out.push(kind); };
  // A preset security policy is changed on the preset page, not on the policy list.
  if ((step.settings || []).some(s => /Preset Security Policy/i.test(s.name || ''))) add('presetPolicy');
  for (const s of step.settings || []) if (s.kind !== 'mailbox' || /Mailbox|Recipient|Message size|Automatic reply|Forward/.test(component)) add(s.kind);
  const hit = STEP_PORTAL_KINDS.find(([prefix]) => component.startsWith(prefix));
  for (const kind of hit ? hit[1] : []) add(kind);
  return out;
}
