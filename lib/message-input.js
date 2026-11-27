// Turns a real message (its header block, or a whole .eml) into a NextHop test message, so the prediction can be
// run for that message against today's configuration. Every value says which header it came from, and anything the
// headers cannot tell (or that NextHop models differently) is listed in `notes` instead of guessed silently.
// Pure: no DOM, no network.
import { parseHeaderBlock, first, values, parsePairs, parseAuthentication, buildHops } from './analyzer.js';
import { splitMessage } from './message.js';
import { orgOf, addressOf, domainOf, AUTH_RESULTS, VERDICTS } from './nexthop.js';

const str = v => (v == null ? '' : String(v));
const lc = v => str(v).toLowerCase();

// "Name" <a@b.c>, a@b.c, Name <a@b.c> ... -> [{ name, address }]
export function parseAddressList(value) {
  const out = [];
  for (const part of str(value).match(/(?:"[^"]*"|[^,"])+/g) || []) {
    const address = addressOf(part);
    if (!address) continue;
    const name = part.replace(/<[^>]*>/, '').replace(address, '').replace(/["']/g, '').trim();
    out.push({ name, address });
  }
  return out;
}

// RFC 2047 encoded words in Subject and display names (=?utf-8?B?...?= and =?utf-8?Q?...?=).
export function decodeWords(value) {
  return str(value).replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (all, charset, enc, text) => {
    try {
      const bytes = /b/i.test(enc)
        ? Uint8Array.from(atob(text), c => c.charCodeAt(0))
        : Uint8Array.from(text.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (m, h) => String.fromCharCode(parseInt(h, 16))), c => c.charCodeAt(0));
      return new TextDecoder(/utf-?8/i.test(charset) ? 'utf-8' : 'latin1').decode(bytes);
    } catch { return all; }
  }).replace(/\?=\s+=\?/g, '?==?');
}

function decodeQp(text) { return str(text).replace(/=\r?\n/g, '').replace(/=([0-9A-Fa-f]{2})/g, (m, h) => String.fromCharCode(parseInt(h, 16))); }
function decodeB64(text) {
  try { return new TextDecoder('utf-8').decode(Uint8Array.from(atob(str(text).replace(/\s+/g, '')), c => c.charCodeAt(0))); } catch { return ''; }
}

// A small MIME walk: text/plain (or stripped text/html) for the body, and the name and size of each attachment.
export function readMime(headerText, bodyText, depth = 0) {
  const headers = parseHeaderBlock(headerText);
  const type = first(headers, 'Content-Type') || 'text/plain';
  const disposition = first(headers, 'Content-Disposition');
  const encoding = lc(first(headers, 'Content-Transfer-Encoding'));
  const filename = decodeWords((/filename\*?="?([^";]+)"?/i.exec(disposition) || /name\*?="?([^";]+)"?/i.exec(type) || [])[1] || '');
  const out = { text: '', html: '', attachments: [] };
  const boundary = (/boundary="?([^";]+)"?/i.exec(type) || [])[1];
  if (/^multipart\//i.test(type) && boundary && depth < 6) {
    for (const part of str(bodyText).split(`--${boundary}`).slice(1)) {
      if (part.startsWith('--')) break;
      const { headers: ph, body: pb } = splitMessage(part.replace(/^\r?\n/, ''));
      const inner = readMime(ph, pb, depth + 1);
      out.text ||= inner.text; out.html ||= inner.html; out.attachments.push(...inner.attachments);
    }
    return out;
  }
  if (/attachment/i.test(disposition) || (filename && !/^text\//i.test(type))) {
    const raw = str(bodyText).replace(/\s+/g, '');
    const sizeBytes = encoding === 'base64' ? Math.round(raw.length * 0.75) : str(bodyText).length;
    out.attachments.push({ name: filename || 'attachment', sizeBytes });
    return out;
  }
  const decoded = encoding === 'base64' ? decodeB64(bodyText) : encoding === 'quoted-printable' ? decodeQp(bodyText) : str(bodyText);
  if (/text\/html/i.test(type)) out.html = decoded.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/[ \t]+/g, ' ').trim();
  else if (/text\/plain/i.test(type)) out.text = decoded.trim();
  return out;
}

const sizeText = bytes => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
const isPublicIpv4 = ip => /^\d{1,3}(\.\d{1,3}){3}$/.test(ip) && !/^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/.test(ip);

// raw: the header block, or a whole message (headers, blank line, body). cfg: the NextHop configuration.
// Returns { input, read: [{ field, value, from }], notes: [string], rulesInHeaders: [string] }.
export function inputFromMessage(raw, cfg, { body: bodyOverride } = {}) {
  const { headers: headerText, body: bodyText } = splitMessage(raw);
  const headers = parseHeaderBlock(headerText);
  if (!headers.length) throw new Error('No message headers were found. Paste the whole header block (it starts with lines like Received: and From:), or choose a .eml or .msg file.');
  const org = orgOf(cfg);
  const internal = a => org.isAccepted(domainOf(a));
  const read = [];
  const notes = [];
  const took = (field, value, from) => { if (value !== '' && value != null) read.push({ field, value: String(value), from }); };

  const from = parseAddressList(decodeWords(first(headers, 'From')))[0] || null;
  const recipients = ['To', 'Cc'].flatMap(h => parseAddressList(decodeWords(values(headers, h).join(', '))));
  const ff = parsePairs(first(headers, 'X-Forefront-Antispam-Report'));
  const ms = parsePairs(first(headers, 'X-Microsoft-Antispam'));
  const auth = parseAuthentication(headers);
  const directionality = lc(first(headers, 'X-MS-Exchange-Organization-MessageDirectionality'));

  // Direction: Microsoft's own stamp first, then the From domain against this configuration's accepted domains.
  let direction = 'inbound', dirFrom = 'From is not one of this configuration\'s accepted domains';
  if (ff.DIR === 'OUT' || directionality === 'originating') { direction = 'outbound'; dirFrom = ff.DIR === 'OUT' ? 'X-Forefront-Antispam-Report DIR:OUT' : 'X-MS-Exchange-Organization-MessageDirectionality: Originating'; }
  else if (ff.DIR === 'INB' || directionality === 'incoming') { dirFrom = ff.DIR === 'INB' ? 'X-Forefront-Antispam-Report DIR:INB' : 'X-MS-Exchange-Organization-MessageDirectionality: Incoming'; }
  else if (from && internal(from.address)) { direction = 'outbound'; dirFrom = 'From is one of this configuration\'s accepted domains'; }
  if (ff.DIR === 'INT') notes.push('Microsoft stamped this message as internal (DIR:INT). NextHop predicts inbound and outbound mail only, so it is treated as inbound from outside.');
  took('Direction', direction === 'outbound' ? 'Outbound: the mailbox to outside' : 'Inbound: outside to the mailbox', dirFrom);

  let externalAddress = '', fromName = '';
  if (direction === 'inbound') {
    externalAddress = from?.address || '';
    fromName = from?.name || '';
    took('Outside address', externalAddress, 'From');
    took('From display name', fromName, 'From');
    const inside = recipients.filter(r => internal(r.address)).map(r => r.address);
    if (inside.length && org.mailbox.primary && !inside.includes(lc(org.mailbox.primary)) && !inside.some(a => org.mailbox.addresses.includes(a))) {
      notes.push(`The message was addressed to ${inside.join(', ')}. This configuration holds one mailbox, ${org.mailbox.primary}, so the prediction uses that mailbox's own settings (inbox rules, junk settings, groups, size limits). Organization-wide settings are the same for everyone.`);
    }
  } else {
    const outside = recipients.find(r => !internal(r.address));
    externalAddress = outside?.address || '';
    took('Outside address', externalAddress, outside ? 'To or Cc (the first outside recipient)' : '');
    if (!outside) notes.push('Every recipient in To and Cc is inside the organization. NextHop predicts mail to outside recipients only, so put an outside address in the form.');
    if (from && org.mailbox.primary && lc(from.address) !== lc(org.mailbox.primary) && !org.mailbox.addresses.includes(lc(from.address))) {
      notes.push(`The message was sent by ${from.address}. This configuration holds one mailbox, ${org.mailbox.primary}, so the prediction uses that mailbox as the sender (its groups, forwarding and size limits).`);
    }
  }

  // Sending IP: Microsoft's connecting IP (CIP) is the one its filters judged; otherwise the oldest outside hop.
  let ip = '';
  if (direction === 'inbound') {
    if (ff.CIP) { ip = ff.CIP; took('Sending IP', ip, 'X-Forefront-Antispam-Report CIP'); }
    else {
      const hop = buildHops(headers).find(h => h.kind === 'external' && isPublicIpv4(h.ip)) || buildHops(headers).find(h => isPublicIpv4(h.ip));
      if (hop) { ip = hop.ip; took('Sending IP', ip, `Received (the first hop from ${hop.from || 'outside'})`); }
    }
    if (ip && !/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) { notes.push(`The sending IP ${ip} is IPv6. NextHop compares IPv4 ranges only, so connector and IP list matches are not checked for it.`); }
  }

  // Sender authentication, as Microsoft judged it.
  let authValue = 'pass', authFrom = 'Authentication-Results (passes, or nothing failed)';
  const dmarc = auth.dmarc, comp = auth.compauth;
  if (direction === 'inbound') {
    if (dmarc?.result === 'fail') {
      const action = dmarc.action;
      authValue = /reject/.test(action) ? 'dmarc-reject' : /quarantine/.test(action) ? 'dmarc-quarantine' : 'dmarc-none';
      authFrom = `Authentication-Results dmarc=fail${action ? ` action=${action}` : ''}`;
    } else if (comp?.result === 'fail' || ff.CAT === 'SPOOF') {
      authValue = 'composite-fail';
      authFrom = comp?.result === 'fail' ? `Authentication-Results compauth=fail${comp.reason ? ` reason=${comp.reason}` : ''}` : 'X-Forefront-Antispam-Report CAT:SPOOF';
    } else if (!dmarc && !comp && !auth.spf) authFrom = 'No Authentication-Results header, so NextHop assumes it passes';
    took('Sender authentication', AUTH_RESULTS[authValue], authFrom);
  }

  // Spam verdict and bulk level, as Microsoft stamped them.
  const CAT_VERDICT = { HPHSH: 'hcphish', HPHISH: 'hcphish', PHSH: 'phish', HSPM: 'hcspam', SPM: 'spam', BULK: 'bulk' };
  let verdict = 'clean', verdictFrom = 'No spam or phishing category in X-Forefront-Antispam-Report';
  if (CAT_VERDICT[ff.CAT]) { verdict = CAT_VERDICT[ff.CAT]; verdictFrom = `X-Forefront-Antispam-Report CAT:${ff.CAT}`; }
  else if (ff.SFV === 'SPM') { verdict = 'spam'; verdictFrom = 'X-Forefront-Antispam-Report SFV:SPM'; }
  if (direction === 'inbound') took('Spam filter verdict', VERDICTS[verdict], verdictFrom);
  if (['SKN', 'SKA', 'SKI', 'SKQ'].includes(ff.SFV)) notes.push(`Spam filtering was skipped for this message when it arrived (SFV:${ff.SFV}), so its real spam verdict is unknown. The form uses "Not spam"; change it to see what today's policies would do with spam.`);
  const bcl = ms.BCL || ff.BCL || '';
  if (direction === 'inbound' && bcl !== '') took('Bulk complaint level', bcl, ms.BCL ? 'X-Microsoft-Antispam BCL' : 'X-Forefront-Antispam-Report BCL');
  const malware = ff.CAT === 'MALW';
  if (malware) took('Attachment is malware', 'Yes', 'X-Forefront-Antispam-Report CAT:MALW');

  // Message type.
  const autoSubmitted = lc(first(headers, 'Auto-Submitted'));
  let kind = 'normal';
  if (/auto-replied/.test(autoSubmitted) || /^(automatic reply|out of office)/i.test(decodeWords(first(headers, 'Subject')))) kind = 'autoreply';
  else if (/auto-forwarded/.test(autoSubmitted) || first(headers, 'X-MS-Exchange-Inbox-Rules-Loop') || first(headers, 'X-MS-Exchange-Generated-Message-Source')) kind = 'autoforward';
  if (kind !== 'normal') took('Message type', kind === 'autoreply' ? 'An automatic reply' : 'An automatic forward', autoSubmitted ? `Auto-Submitted: ${autoSubmitted}` : 'Exchange inbox rule headers');

  const subject = decodeWords(first(headers, 'Subject'));
  took('Subject', subject, 'Subject');

  // Body and attachments: only a whole message has them. A header block alone has neither.
  const mime = bodyText ? readMime(headerText, bodyText) : { text: '', html: '', attachments: [] };
  const body = str(bodyOverride ?? (mime.text || mime.html)).slice(0, 8000);
  if (body) took('Body', `${body.length} characters`, mime.text ? 'The text/plain part' : 'The HTML part, with the tags removed');
  else notes.push('No message body was given (headers only). Rules and DLP that look at the body are judged on the subject alone. Paste body text into the form, or choose the .eml file, to include it.');
  const attachments = mime.attachments.map(a => `${a.name} (${sizeText(a.sizeBytes)})`).join(', ');
  if (attachments) took('Attachments', attachments, 'MIME parts marked as attachments');

  // What actually happened, for comparison with the prediction.
  const history = str(first(headers, 'X-MS-Exchange-Organization-Rules-Execution-History'));
  const named = [...history.matchAll(/Rule="([^"]+)"/g)].map(m => m[1]);
  const rulesInHeaders = named.length ? named : history.split(/%%%|;/).map(x => x.trim()).filter(Boolean);

  const input = {
    direction, externalAddress: externalAddress || 'someone@outside.example', fromName, ip,
    auth: authValue, verdict, bcl: bcl === '' ? '' : String(Math.max(0, Math.min(9, Number(bcl) || 0))), malware,
    label: '', kind, subject, body, attachments,
  };
  return { input, read, notes, rulesInHeaders, messageId: first(headers, 'Message-ID'), date: first(headers, 'Date') };
}
