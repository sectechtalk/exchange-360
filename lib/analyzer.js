// Deterministic message-hop analyzer. No model and no network: the same headers always
// produce the same object. A later chat can read this object; v1 does not call one.
// Field text follows Microsoft Learn: Anti-spam message headers (EOP/MDO), retrieved 2026-11-17.
export const ANALYZER_VERSION = 1;
export const SHARE_FORMAT = 'ex360.hop-share.v1';

export const SFV = {
  BLK: 'Filtering was skipped and the message was blocked because the sender is on a mailbox Blocked Senders list.',
  NSPM: 'Spam filtering marked the message as non-spam and sent it on to the recipients.',
  SFE: 'Filtering was skipped and the message was allowed because the sender is on a mailbox Safe Senders list.',
  SKA: 'Spam filtering was skipped and the message was delivered because the sender or domain is on an anti-spam policy allow list.',
  SKB: 'The message was marked as spam because the sender or domain is on an anti-spam policy block list.',
  SKI: 'Spam filtering was skipped because the connecting IP is on the connection filter IP allow list.',
  SKN: 'Spam filtering was bypassed by an Exchange mail flow (transport) rule.',
  SKQ: 'The message was released from quarantine and sent to the recipients.',
  SKS: 'Something asked for the message to be treated as spam before filtering (a transport rule that set the SCL, or a hybrid spam decision). Secure by default may not honor that request. SFV:SKS is stamped only when the request is honored.',
  SPM: 'Spam filtering marked the message as spam.',
};

export const CAT = {
  AMP: 'Anti-malware policy.',
  BIMP: 'Brand impersonation. This verdict needs Microsoft Defender for Office 365.',
  BULK: 'Bulk mail.',
  DIMP: 'Domain impersonation. This verdict needs Microsoft Defender for Office 365.',
  FTBP: 'Anti-malware common-attachments filter.',
  GIMP: 'Mailbox intelligence impersonation. This verdict needs Microsoft Defender for Office 365.',
  HPHSH: 'High confidence phishing.',
  HPHISH: 'High confidence phishing.',
  HSPM: 'High confidence spam.',
  INTOS: 'Intra-organization phishing.',
  MALW: 'Malware.',
  NONE: 'No threat category. Filtering found nothing to classify.',
  OSPM: 'Outbound spam.',
  PHSH: 'Phishing.',
  SAP: 'Safe Attachments. This verdict needs Microsoft Defender for Office 365.',
  SPM: 'Spam.',
  SPOOF: 'Spoofing. This category is not an impersonation verdict. Impersonation is stamped as SFTY 9.19 or 9.20, or as CAT DIMP, UIMP, BIMP or GIMP.',
  UIMP: 'User impersonation. This verdict needs Microsoft Defender for Office 365.',
};

// Microsoft's documented meaning of each reason. These sentences do not claim what this
// message's DMARC action= stamp says; explainCompauth adds that, and says when the two disagree.
// Source: Anti-spam message headers, Composite authentication reason codes (Microsoft Learn, 2026-11-17).
export const COMPAUTH_REASONS = {
  '000': 'Explicit authentication failed. Microsoft documents reason 000 as a DMARC failure where the published policy is p=quarantine or p=reject.',
  '001': 'Implicit authentication failed. Microsoft documents reason 001 as no authentication records, or a weak failure policy (SPF ~all or ?all, or DMARC p=none).',
  '002': 'An administrator has prohibited this sender or domain from sending spoofed mail.',
  '010': 'Microsoft documents reason 010 as a DMARC failure with p=quarantine or p=reject where the From domain is one of your accepted domains (intra-org spoof).',
  '100': 'SPF or DKIM passed and the MAIL FROM domain aligns with the From domain.',
  '101': 'The message was DKIM-signed by the domain in the From address.',
  '102': 'The MAIL FROM and From domains align, and SPF passed.',
  '103': 'The From domain aligns with the PTR record of the source IP.',
  '104': 'The PTR record of the source IP aligns with the From domain.',
  '108': 'DKIM failed because an earlier legitimate hop changed the body, for example on-premises mail.',
  '109': 'The sender has no DMARC record, but the message would have passed if it had one.',
  '111': 'DMARC hit a temporary or permanent error, but SPF or DKIM still aligns with the From domain.',
  '112': 'A DNS timeout stopped the DMARC record from being read.',
  '115': 'The message was sent from a Microsoft 365 organization whose From domain is an accepted domain.',
  '116': 'The MX for the From domain aligns with the PTR of the connecting IP.',
  '130': 'A trusted ARC sealer overrode a DMARC failure.',
  '201': 'The PTR for the From domain aligns with the subnet of the connecting IP PTR. Soft pass.',
  '202': 'The From domain aligns with the PTR domain of the connecting IP. Soft pass.',
  '501': 'DMARC was not enforced. The message is a valid non-delivery report and the sender and recipient have written before.',
  '502': 'DMARC was not enforced. The message is a valid non-delivery report for mail this organization sent.',
  '601': 'Implicit authentication failed. The sending domain is an accepted domain (intra-org spoof).',
  '701': 'DMARC was not enforced because this organization has a history of legitimate mail from this infrastructure.',
  '702': 'DMARC was not enforced because this organization has a history of legitimate mail from this infrastructure.',
  '703': 'DMARC was not enforced because this organization has a history of legitimate mail from this infrastructure.',
  '704': 'DMARC was not enforced because this organization has a history of legitimate mail from this infrastructure.',
  '905': 'DMARC was not enforced because of complex routing, such as mail passing through on-premises Exchange or another service before Microsoft 365.',
};

export const AUTHAS = {
  Anonymous: 'The message was not authenticated. Typical of mail from the internet.',
  Internal: 'The message was authenticated as a mailbox inside this organization.',
  Partner: 'The message was authenticated by a partner inbound connector.',
};

const MDO_CATS = new Set(['BIMP', 'DIMP', 'GIMP', 'SAP', 'UIMP']);

export function unfold(raw) {
  return String(raw || '').replace(/\r\n/g, '\n').replace(/\n([ \t]+)/g, ' ');
}

export function parseHeaderBlock(raw) {
  const text = unfold(raw);
  const headers = [];
  const end = text.search(/\n\n/);
  const block = (end === -1 ? text : text.slice(0, end)).trim();
  if (!block) return headers;
  for (const line of block.split('\n')) {
    const m = /^([^:\s][^:]*):\s*(.*)$/.exec(line);
    if (m) headers.push({ name: m[1], value: m[2] });
  }
  return headers;
}

export function values(headers, name) {
  const n = name.toLowerCase();
  return headers.filter(h => h.name.toLowerCase() === n).map(h => h.value);
}

export function first(headers, name) {
  return values(headers, name)[0] || '';
}

export function parseReceived(value) {
  const semi = value.lastIndexOf(';');
  const date = semi === -1 ? '' : value.slice(semi + 1).trim();
  const head = semi === -1 ? value : value.slice(0, semi);
  const time = Date.parse(date);
  const fromM = /\bfrom\s+(\S+)(?:\s+\(([^)]*)\))?/i.exec(head);
  const byM = /\bby\s+(\S+)/i.exec(head);
  const withM = /\bwith\s+([A-Za-z0-9]+)/i.exec(head);
  const tls = /version=(TLS[0-9_.]+)/i.exec(head);
  const cipher = /cipher=([A-Z0-9_]+)/i.exec(head);
  const ip = /\[([0-9a-f:.]+)\]/i.exec(head);
  return {
    from: fromM?.[1] || '',
    fromDetail: fromM?.[2] || '',
    by: byM?.[1] || '',
    with: withM?.[1] || '',
    tls: tls?.[1] || '',
    cipher: cipher?.[1] || '',
    ip: ip?.[1] || '',
    date,
    time: Number.isNaN(time) ? null : time,
    raw: value,
  };
}

export function hopKind(hop) {
  // The server that received the message decides the hop. A line "from EOP by Exchange" is an Exchange hop.
  const host = `${hop.by || hop.from}`.toLowerCase();
  if (host.includes('mail.protection.outlook.com') || host.includes('.protection.outlook.com')) return 'eop';
  if (host.includes('prod.outlook.com') || host.includes('outlook.office365.com') || host.includes('outlook.com') || host.includes('prod.exchangelabs.com')) return 'exo';
  return 'external';
}

export function buildHops(headers) {
  // Received is prepended, so the first header is the newest hop. Chronological order is the reverse.
  const received = values(headers, 'Received').map(parseReceived).reverse();
  return received.map((hop, i) => {
    const prev = received[i - 1];
    const delayMs = prev && hop.time != null && prev.time != null ? hop.time - prev.time : null;
    return { index: i + 1, ...hop, kind: hopKind(hop), delayMs };
  });
}

export function parsePairs(value) {
  const out = {};
  for (const part of String(value || '').split(';')) {
    const m = /^\s*([A-Za-z][A-Za-z0-9-]*)\s*:\s*(.*?)\s*$/.exec(part);
    if (m && m[2] !== '') out[m[1].toUpperCase()] = m[2];
  }
  return out;
}

function authMethod(blob, name) {
  const re = new RegExp(`\\b${name}=([a-z]+)\\s*(?:\\(([^)]*)\\))?`, 'i');
  const m = re.exec(blob);
  if (!m) return null;
  return { result: m[1].toLowerCase(), detail: m[2] || '' };
}

export function parseAuthentication(headers) {
  const blobs = values(headers, 'Authentication-Results');
  const arc = values(headers, 'ARC-Authentication-Results');
  const seal = values(headers, 'ARC-Seal');
  const blob = blobs.join(' ');
  const comp = /compauth=([a-z]+)\s*(?:reason=([0-9]{3}))?/i.exec(blob);
  const spf = authMethod(blob, 'spf');
  const dkim = [];
  for (const m of blob.matchAll(/dkim=([a-z]+)\s*(?:\(([^)]*)\))?\s*(?:header\.d=(\S+))?/gi)) {
    dkim.push({ result: m[1].toLowerCase(), detail: m[2] || '', domain: (m[3] || '').replace(/;$/, '') });
  }
  const dmarc = /dmarc=([a-z]+)\s*(?:action=([a-z.]+))?\s*(?:header\.from=(\S+))?/i.exec(blob);
  const mailfrom = /smtp\.mailfrom=(\S+)/i.exec(blob);
  const from = /header\.from=(\S+)/i.exec(blob);
  const cv = /(?:^|;)\s*cv=([a-z]+)/i.exec(seal.join(' '));
  return {
    spf,
    dkim,
    dmarc: dmarc ? { result: dmarc[1].toLowerCase(), action: (dmarc[2] || '').toLowerCase(), from: (dmarc[3] || from?.[1] || '').replace(/;$/, '') } : null,
    mailFrom: (mailfrom?.[1] || '').replace(/;$/, ''),
    headerFrom: (from?.[1] || '').replace(/;$/, ''),
    compauth: comp ? { result: comp[1].toLowerCase(), reason: comp[2] || '' } : null,
    arc: { present: arc.length > 0 || seal.length > 0, cv: cv?.[1]?.toLowerCase() || '', seals: seal.length },
  };
}

export function explainScl(value) {
  const n = Number(value);
  if (value === '' || value == null || Number.isNaN(n)) return 'No SCL was stamped.';
  if (n === -1) return 'SCL -1 means filtering was skipped and the message is treated as trusted. In Exchange Online the SCL does not decide the action. Read CAT, SFV and DIR.';
  if (n <= 1) return `SCL ${n} is a low spam score. In Exchange Online the SCL does not decide the action. Read CAT, SFV and DIR.`;
  if (n <= 4) return `SCL ${n} is a suspicious score. In Exchange Online the SCL does not decide the action. Read CAT, SFV and DIR.`;
  if (n <= 6) return `SCL ${n} is in the range that on-premises Exchange treats as spam. In Exchange Online the SCL does not decide the action. Read CAT, SFV and DIR.`;
  return `SCL ${n} is a high spam score. In Exchange Online the SCL does not decide the action. Read CAT, SFV and DIR.`;
}

export function explainBcl(value) {
  const n = Number(value);
  if (value === '' || value == null || Number.isNaN(n)) return 'No BCL was stamped.';
  if (n === 0) return 'BCL 0 means the message was not identified as bulk.';
  if (n < 7) return `BCL ${n} is below Microsoft's default bulk threshold of 7. A tenant can set a different threshold, so this number alone does not show whether the message was blocked as bulk.`;
  return `BCL ${n} is at or above Microsoft's default bulk threshold of 7. With MarkAsSpamBulkMail on (the default), bulk mail at this level is treated as spam. A tenant can set a different threshold.`;
}

export function explainPcl(value) {
  const n = Number(value);
  if (value === '' || value == null || Number.isNaN(n)) return 'No PCL was stamped.';
  if (n === 0) return 'PCL 0 means no phish confidence was added. The phish verdict, if any, is in CAT and SFTY.';
  return `PCL ${n} is a phish confidence level. A higher number means Microsoft is more confident the message is phishing. The verdict is in CAT and SFTY, not in this number alone.`;
}

const IMPERSONATION_CATS = new Set(['BIMP', 'DIMP', 'GIMP', 'UIMP']);
const IMPERSONATION_SFTY = new Set(['9.19', '9.20']);

export function isImpersonationVerdict(cat, sfty) {
  return IMPERSONATION_CATS.has(String(cat || '').toUpperCase()) || IMPERSONATION_SFTY.has(String(sfty || ''));
}

export function explainSfty(value) {
  const map = {
    '9.19': 'SFTY 9.19 is a domain impersonation verdict. The sending domain is trying to look like a protected domain. Defender for Office 365 stamps this value. The in-mailbox safety tip is shown only when domain impersonation protection is turned on.',
    '9.20': 'SFTY 9.20 is a user impersonation verdict. The sender is trying to look like someone in the organization or a protected user. Defender for Office 365 stamps this value.',
    '9.25': 'SFTY 9.25 is the first-contact safety tip. The recipient has not seen this sender before. It is not an impersonation verdict.',
  };
  return map[value] || (value ? `SFTY ${value} is not one of the documented safety-tip values (9.19, 9.20, 9.25).` : '');
}

// What action= records, from the Authentication-results DMARC action values on Microsoft Learn.
function dmarcActionSentence(action) {
  if (!action) return 'This header does not stamp a DMARC action, so the p= value cannot be read from the message.';
  if (action === 'none') return 'This message stamps DMARC action=none, so the action recorded here is none, not quarantine or reject.';
  if (action === 'oreject') return 'This message stamps DMARC action=oreject, which is a reject action.';
  if (action === 'pct.quarantine') return 'This message stamps DMARC action=pct.quarantine, so the recorded policy is quarantine and pct was not 100.';
  if (action === 'pct.reject') return 'This message stamps DMARC action=pct.reject, so the recorded policy is reject and pct was not 100.';
  if (action === 'permerror') return 'This message stamps DMARC action=permerror, a permanent DMARC error, not a p= policy.';
  if (action === 'temperror') return 'This message stamps DMARC action=temperror, a temporary DMARC error, not a p= policy.';
  return `This message stamps DMARC action=${action}.`;
}

function recordedPolicy(action) {
  if (action === 'oreject' || action === 'pct.reject') return 'reject';
  if (action === 'pct.quarantine') return 'quarantine';
  if (action === 'none') return 'none';
  return '';
}

// 000 and 010 are documented as an enforcing policy. 001 and the "not enforced" reasons are the opposite.
const ENFORCING_REASONS = new Set(['000', '010']);
const UNEFORCED_REASONS = new Set(['001', '501', '502', '701', '702', '703', '704', '905']);

function policyAgreement(reason, action) {
  const recorded = recordedPolicy(action);
  if (!action || !recorded) return '';
  if (ENFORCING_REASONS.has(reason)) {
    if (recorded === 'reject' || recorded === 'quarantine') return 'The DMARC action stamp matches that documented policy.';
    if (recorded === 'none') return 'The reason code and the action stamp disagree. Trust action= for what was recorded on this message.';
  }
  if (UNEFORCED_REASONS.has(reason)) {
    if (recorded === 'none') return 'The DMARC action=none stamp agrees with a policy that is not being enforced.';
    if (recorded === 'reject' || recorded === 'quarantine') return 'The reason code and the action stamp disagree. The action recorded here is enforcing, which that reason code does not describe.';
  }
  return '';
}

function expectedCompauthResult(reason) {
  if (!reason) return null;
  const band = reason[0];
  if (band === '1' || band === '7') return 'pass';
  if (band === '2') return 'softpass';
  if (band === '3' || band === '4' || band === '9') return 'none';
  if (band === '0' || band === '6') return 'fail';
  return null;
}

function bandText(reason) {
  const band = reason[0];
  if (band === '1') return 'A 1xx reason means explicit or implicit authentication passed (compauth=pass).';
  if (band === '2') return 'A 2xx reason means composite authentication soft-passed (compauth=softpass).';
  if (band === '3') return 'A 3xx reason means composite authentication was not checked (compauth=none).';
  if (band === '4') return 'A 4xx reason means composite authentication was bypassed (compauth=none).';
  if (band === '5') return 'A 5xx reason means DMARC was not enforced.';
  if (band === '6') return 'A 6xx reason means implicit authentication failed (compauth=fail).';
  if (band === '7') return 'A 7xx reason means implicit authentication passed (compauth=pass).';
  if (band === '9') return 'A 9xx reason means composite authentication was bypassed (compauth=none).';
  if (band === '0') return 'A 0xx reason means authentication failed (compauth=fail).';
  return '';
}

export function explainCompauth(comp, context = {}) {
  if (!comp) return 'No composite authentication result was stamped.';
  const reason = comp.reason || '';
  const specific = COMPAUTH_REASONS[reason];
  const parts = [`compauth=${comp.result || 'unknown'}${reason ? ` reason=${reason}` : ''}.`];
  parts.push(specific || (reason ? bandText(reason) : 'No compauth reason code was stamped.'));
  if (reason === '130' && context.arc?.cv === 'fail') {
    parts.push('Reason 130 means a trusted ARC sealer overrode a DMARC failure, but this message stamps ARC cv=fail, so the chain did not validate. The reason code and the ARC seal disagree.');
  }
  if (ENFORCING_REASONS.has(reason) || UNEFORCED_REASONS.has(reason)) parts.push(dmarcActionSentence(context.dmarc?.action || ''));
  const agreement = policyAgreement(reason, context.dmarc?.action || '');
  if (agreement) parts.push(agreement);
  const expected = expectedCompauthResult(reason);
  if (expected && comp.result && comp.result !== expected) {
    parts.push(`The compauth result stamped here is ${comp.result}, which does not match the ${expected} result Microsoft documents for this reason band.`);
  }
  return parts.filter(Boolean).join(' ');
}

export function hopSummary(hops) {
  const count = hops.length;
  if (!count) return 'No Received lines were found, so there is no hop list.';
  const eop = hops.filter(hop => hop.kind === 'eop').length;
  const exo = hops.filter(hop => hop.kind === 'exo').length;
  const ofThem = (n, singular, plural) => `${n} of them ${n === 1 ? 'is' : 'are'} ${n === 1 ? singular : plural}`;
  return `This message crossed ${count} ${count === 1 ? 'hop' : 'hops'}. ${ofThem(eop, 'an Exchange Online Protection hop', 'Exchange Online Protection hops')} and ${ofThem(exo, 'an Exchange Online hop', 'Exchange Online hops')}.`;
}

export function alignment(mailFromDomain, fromDomain, dkimDomains, mode = 'r') {
  const org = d => {
    const parts = String(d || '').toLowerCase().replace(/\.$/, '').split('.');
    return parts.length >= 2 ? parts.slice(-2).join('.') : parts.join('.');
  };
  const from = String(fromDomain || '').toLowerCase();
  const mail = String(mailFromDomain || '').toLowerCase();
  const same = (a, b) => mode === 's' ? a === b : org(a) === org(b);
  return {
    mode: mode === 's' ? 'strict' : 'relaxed',
    spfAligned: Boolean(mail && from && same(mail, from)),
    dkimAligned: dkimDomains.some(d => d && from && same(d, from)),
    organizationalDomain: org(from),
  };
}

function domainOf(addr) {
  const m = /@([^>\s;]+)/.exec(addr || '');
  return (m?.[1] || '').replace(/[>;].*$/, '').toLowerCase();
}

export function explainAuth(auth, fromHeader) {
  const lines = [];
  const fromDomain = auth.headerFrom || domainOf(fromHeader);
  if (auth.spf) lines.push(`SPF ${auth.spf.result}${auth.spf.detail ? ` (${auth.spf.detail})` : ''} for MAIL FROM ${auth.mailFrom || '(not stamped)'}.`);
  else lines.push('No SPF result was stamped in Authentication-Results.');
  if (!auth.dkim.length) lines.push('No DKIM result was stamped.');
  for (const d of auth.dkim) lines.push(`DKIM ${d.result}${d.domain ? ` for ${d.domain}` : ''}${d.detail ? ` (${d.detail})` : ''}.`);
  if (auth.dmarc) lines.push(`DMARC ${auth.dmarc.result}${auth.dmarc.action ? ` action=${auth.dmarc.action}` : ' (no action stamped)'} for From domain ${auth.dmarc.from || fromDomain || '(unknown)'}.`);
  else lines.push('No DMARC result was stamped.');
  lines.push(explainCompauth(auth.compauth, { dmarc: auth.dmarc, arc: auth.arc }));
  if (auth.arc.present) {
    const cv = auth.arc.cv === 'pass' ? 'The ARC chain validated.'
      : auth.arc.cv === 'fail' ? 'The ARC chain did not validate.'
      : auth.arc.cv === 'none' ? 'There was no ARC chain to validate.'
      : 'An ARC seal is present.';
    const seals = auth.arc.seals;
    lines.push(`ARC: ${cv} ${seals} ${seals === 1 ? 'seal' : 'seals'}.`);
  } else lines.push('No ARC seal was present. That is normal when the message did not cross a trusted ARC sealer.');
  const align = alignment(domainOf(auth.mailFrom) || auth.mailFrom, fromDomain, auth.dkim.filter(d => d.result === 'pass').map(d => d.domain));
  if (fromDomain) {
    lines.push(align.spfAligned
      ? `SPF is aligned with the From domain ${fromDomain} (relaxed alignment, organizational domain ${align.organizationalDomain}).`
      : `SPF is not aligned with the From domain ${fromDomain}. The MAIL FROM domain and the address the person sees are different.`);
    lines.push(align.dkimAligned
      ? 'A passing DKIM signature is aligned with the From domain.'
      : 'No passing DKIM signature is aligned with the From domain.');
  }
  return { lines, alignment: align, fromDomain };
}

function ruleNames(value) {
  return [...String(value || '').matchAll(/Rule="([^"]+)"/g)].map(m => m[1]);
}

export function explainDlpSignals(headers, traceDetail = []) {
  const lines = [];
  const policy = first(headers, 'X-MS-Exchange-Organization-DlpPolicy');
  const rule = first(headers, 'X-MS-Exchange-Organization-DlpRule');
  const action = first(headers, 'X-MS-Exchange-Organization-DlpAction');
  if (policy || rule || action) {
    lines.push(`A DLP header is present${policy ? `: policy ${policy}` : ''}${rule ? `, rule ${rule}` : ''}${action ? `, action ${action}` : ''}. The header does not say whether the policy is in test mode. Test mode tips or logs. An enabled policy can block. Open the policy in Purview to see the mode.`);
  }
  for (const event of traceDetail || []) {
    const type = String(event.event || event.Event || event.type || '');
    const detail = String(event.detail || event.Detail || event.data || '');
    if (/dlp/i.test(type) || /dlp/i.test(detail)) {
      lines.push(`Message trace detail records a DLP event${type ? ` (${type})` : ''}${detail ? `: ${detail}` : ''}. That names the policy or rule that evaluated the message. It is separate from the spam verdict.`);
    } else if (/transport rule/i.test(type)) {
      lines.push(`Message trace detail records a transport rule event${type ? ` (${type})` : ''}${detail ? `: ${detail}` : ''}.`);
    }
  }
  return lines;
}

export function analyze(raw, extra = {}) {
  const headers = parseHeaderBlock(raw);
  const hops = buildHops(headers);
  const auth = parseAuthentication(headers);
  const ff = parsePairs(first(headers, 'X-Forefront-Antispam-Report'));
  const ms = parsePairs(first(headers, 'X-Microsoft-Antispam'));
  const scl = ff.SCL || first(headers, 'X-MS-Exchange-Organization-SCL');
  const pcl = ms.PCL || first(headers, 'X-MS-Exchange-Organization-PCL');
  const bcl = ms.BCL || ff.BCL || '';
  const authAs = first(headers, 'X-MS-Exchange-Organization-AuthAs');
  const rules = ruleNames(first(headers, 'X-MS-Exchange-Organization-Rules-Execution-History'));
  const connector = first(headers, 'X-MS-Exchange-Organization-AuthSource');
  const from = first(headers, 'From');
  const explained = explainAuth(auth, from);
  const findings = [];
  const add = (severity, title, detail) => findings.push({ severity, title, detail });

  if (ff.CAT && ff.CAT !== 'NONE' && CAT[ff.CAT]) add(ff.CAT === 'SPOOF' || ff.CAT.includes('PHSH') || ff.CAT === 'MALW' ? 'high' : 'medium', `Verdict ${ff.CAT}`, CAT[ff.CAT]);
  if (ff.SFV === 'SPM' || ff.SFV === 'SKB') add('high', `Spam verdict ${ff.SFV}`, SFV[ff.SFV]);
  if (ff.SFTY) add('high', `Safety tip ${ff.SFTY}`, explainSfty(ff.SFTY));
  if (auth.compauth?.result === 'fail') add('high', 'Composite authentication failed', explainCompauth(auth.compauth, { dmarc: auth.dmarc, arc: auth.arc }));
  if (auth.dmarc?.result === 'fail') {
    // Microsoft's composite verdict decides delivery. A DMARC fail that compauth still passed
    // (p=none fallback, or a trusted ARC sealer with reason 130) is a warning, not a block.
    const overridden = auth.compauth?.result === 'pass' || auth.compauth?.result === 'softpass';
    const line = explained.lines.find(l => l.startsWith('DMARC')) || 'DMARC failed.';
    if (overridden) add('medium', 'DMARC failed, but composite authentication passed', `${line} compauth=${auth.compauth.result}${auth.compauth.reason ? ` reason=${auth.compauth.reason}` : ''}, so Microsoft did not treat this failure as a spoof.`);
    else add('high', 'DMARC failed', line);
  }
  if (auth.spf?.result === 'fail' || auth.spf?.result === 'softfail') add('medium', `SPF ${auth.spf.result}`, explained.lines[0]);
  if (auth.dkim.some(d => d.result === 'fail')) add('medium', 'DKIM failed', auth.dkim.filter(d => d.result === 'fail').map(d => `${d.domain}: ${d.detail || 'fail'}`).join(' '));
  const internal = authAs.toLowerCase() === 'internal' && !auth.spf;
  if (!internal && !explained.alignment.spfAligned && !explained.alignment.dkimAligned && explained.fromDomain) add('medium', 'No aligned authentication', 'Neither SPF nor a passing DKIM signature aligns with the From domain the recipient sees.');
  if (hops.some(h => h.kind === 'external' && !h.tls)) add('low', 'A hop did not advertise TLS', 'At least one external Received line has no version=TLS. The message may have arrived in the clear on that hop.');
  const slow = hops.filter(h => h.delayMs != null && h.delayMs > 15 * 60 * 1000);
  if (slow.length) add('low', 'A hop was slow', `${slow.length} ${slow.length === 1 ? 'hop' : 'hops'} took more than 15 minutes. Look at the server named in that Received line.`);
  if (MDO_CATS.has(ff.CAT)) add('info', 'Defender for Office 365 verdict', 'This category is produced by Defender for Office 365. A tenant without that license will not stamp it.');
  if (!findings.length) add('info', 'No delivery problem in these headers', 'SPF, DKIM, DMARC and the spam verdicts that are present do not show a failure.');

  const plain = [];
  plain.push(hopSummary(hops));
  plain.push(...explainDlpSignals(headers, extra.traceDetail));
  plain.push(...explained.lines);
  if (ff.SFV) plain.push(`SFV ${ff.SFV}: ${SFV[ff.SFV] || 'Microsoft stamped this filtering verdict.'}`);
  if (ff.CAT) plain.push(`CAT ${ff.CAT}: ${CAT[ff.CAT] || 'Microsoft stamped this threat category.'}`);
  if (scl !== '') plain.push(explainScl(scl));
  if (bcl !== '') plain.push(explainBcl(bcl));
  if (pcl !== '') plain.push(explainPcl(pcl));
  if (ff.SFTY) plain.push(explainSfty(ff.SFTY));
  if (ff.CIP) plain.push(`The connecting IP (CIP) was ${ff.CIP}${ff.CTRY ? ` in ${ff.CTRY}` : ''}.`);
  if (ff.IPV) plain.push(explainField('IPV', ff.IPV));
  if (ff.DIR) plain.push(ff.DIR === 'INB' ? 'DIR:INB means Microsoft treated the message as inbound.' : ff.DIR === 'OUT' ? 'DIR:OUT means Microsoft treated the message as outbound.' : ff.DIR === 'INT' ? 'DIR:INT means Microsoft treated the message as internal.' : `DIR ${ff.DIR}.`);
  if (authAs) plain.push(`AuthAs ${authAs}: ${AUTHAS[authAs] || 'Exchange stamped this authentication class. The documented values are Anonymous, Internal and Partner.'}`);
  if (rules.length) plain.push(`Transport rules that stamped this message: ${rules.join(', ')}.`);
  if (connector) {
    const onEop = /protection\.outlook\.com/i.test(connector);
    plain.push(onEop && (!authAs || authAs.toLowerCase() === 'anonymous')
      ? `Exchange recorded the auth source ${connector}. That name is Exchange Online Protection, which is the usual front door for mail from the internet.`
      : `Exchange recorded the auth source ${connector}.`);
  }
  const delivery = findings.some(f => f.severity === 'high') ? 'likely junk, quarantine, or rejected'
    : findings.some(f => f.severity === 'medium') ? 'delivered, with an authentication or spam warning'
    : 'no header evidence of a block';

  return {
    version: ANALYZER_VERSION,
    chatReady: true,
    deferred: ['Azure OpenAI chat is not in v1. This object is the contract a later chat would read.'],
    summary: {
      from,
      to: first(headers, 'To'),
      subject: first(headers, 'Subject'),
      messageId: first(headers, 'Message-ID'),
      date: first(headers, 'Date'),
      delivery,
      scl: scl === '' ? null : Number(scl),
      bcl: bcl === '' ? null : Number(bcl),
      pcl: pcl === '' ? null : Number(pcl),
      sfv: ff.SFV || '',
      cat: ff.CAT || '',
      spf: auth.spf?.result || '',
      dkim: auth.dkim.map(d => d.result),
      dmarc: auth.dmarc?.result || '',
      compauth: auth.compauth?.result || '',
    },
    hops,
    authentication: { ...auth, explanation: explained.lines, alignment: explained.alignment },
    forefront: ff,
    microsoftAntispam: ms,
    organization: {
      authAs,
      authSource: connector,
      scl,
      pcl,
      direction: first(headers, 'X-MS-Exchange-Organization-MessageDirectionality'),
      rules,
    },
    findings,
    plainLanguage: plain,
    headerCount: headers.length,
  };
}

export function explainField(key, value) {
  const k = String(key || '').toUpperCase();
  if (k === 'SFV') return SFV[value] || `SFV ${value}.`;
  if (k === 'CAT') return CAT[value] || `CAT ${value}.`;
  if (k === 'SCL') return explainScl(value);
  if (k === 'BCL') return explainBcl(value);
  if (k === 'PCL') return explainPcl(value);
  if (k === 'SFTY') return explainSfty(value);
  if (k === 'CIP') return `Connecting IP ${value}. This is the address EOP saw, and the one an IP allow or block list matches.`;
  if (k === 'CTRY') return `Source country or region ${value}, taken from the connecting IP. It can differ from the country the sender claims.`;
  if (k === 'IPV') return value === 'CAL' ? 'IPV:CAL means the connecting IP is on the IP allow list, so spam filtering was skipped.' : value === 'NLI' ? 'IPV:NLI means the connecting IP was not found on an IP reputation list.' : `IPV ${value} is not one of the documented values (CAL or NLI).`;
  if (k === 'DIR') return value === 'INB' ? 'Inbound.' : value === 'OUT' ? 'Outbound.' : value === 'INT' ? 'Internal.' : value;
  if (k === 'H') return `HELO or EHLO string: ${value}.`;
  if (k === 'PTR') return `Reverse DNS of the source IP: ${value || '(none)'}.`;
  if (k === 'LANG') return `Language stamp: ${value}.`;
  if (k === 'SRV' && value === 'BULK') return 'Identified as bulk mail by spam filtering and the BCL threshold.';
  return `${k}: ${value}. Microsoft uses some forefront fields only for its own diagnostics.`;
}
