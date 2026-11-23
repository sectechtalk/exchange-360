// The NextHop prediction as one self-contained web archive (.mhtml) that opens in Edge: the test message, every
// step in order with what happens and why, the settings that caused each step, copies, and what NextHop could not
// predict. Built in the browser from the same result the page shows; nothing is uploaded or saved by Ex360.
// Pure and browser-safe (TextEncoder, no Buffer), so the tests run it in Node too.
import { portalLinks } from './object-links.js';
import { AUTH_RESULTS, VERDICTS, MESSAGE_KINDS, sizeText } from './nexthop.js';

export function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
const safeUrl = url => (/^https:\/\//i.test(String(url || '')) ? escapeHtml(url) : '#');
const TONE = { ok: 'OK', info: 'INFO', medium: 'CHECK', high: 'STOP' };

const CSS = `body{font-family:"Segoe UI",-apple-system,Arial,sans-serif;color:#323130;background:#faf9f8;margin:0;padding:24px 16px;line-height:1.45;font-size:14px}
main{max-width:1000px;margin:0 auto;background:#fff;padding:24px 28px;box-shadow:0 1.6px 3.6px rgba(0,0,0,.13),0 .3px .9px rgba(0,0,0,.11);border-radius:2px}
h1{font-size:24px;font-weight:600;margin:0 0 4px}h2{font-size:18px;font-weight:600;margin:28px 0 8px;padding-bottom:4px;border-bottom:1px solid #edebe9}
.meta{color:#605e5c;margin:0 0 16px}.sample{background:#fff4ce;border-left:4px solid #8a6d00;padding:8px 12px;margin:12px 0}
.outcome{border-left:6px solid #0078d4;background:#eff6fc;padding:12px 16px;margin:12px 0;font-size:16px}
.outcome.high{border-color:#a4262c;background:#fde7e9}.outcome.medium{border-color:#8a6d00;background:#fff4ce}.outcome.ok{border-color:#107c10;background:#dff6dd}
table{border-collapse:collapse;width:100%;margin:8px 0;font-size:13px}th,td{border-bottom:1px solid #edebe9;padding:6px 8px;text-align:left;vertical-align:top}
thead th{background:#f3f2f1;font-weight:600}.facts th{width:30%;font-weight:600;color:#605e5c}
ol.steps{list-style:none;margin:0;padding:0}ol.steps li{display:grid;grid-template-columns:2.2rem 4rem 13rem 1fr;gap:10px;padding:8px 6px;border-left:4px solid #c8c6c4;margin:2px 0;border-radius:2px}
ol.steps li.ok{border-color:#107c10}ol.steps li.info{border-color:#0078d4}ol.steps li.medium{border-color:#c19c00}ol.steps li.high{border-color:#a4262c}
.n{font-weight:600;text-align:right}.comp{font-weight:600}.tag{font-size:11px;font-weight:600;padding:1px 6px;border-radius:2px;background:#edebe9;height:fit-content}
.tag.ok{background:#dff6dd;color:#0b5a0b}.tag.medium{background:#fff4ce;color:#5c4700}.tag.high{background:#fde7e9;color:#a4262c}.tag.info{background:#eff6fc;color:#004578}
a{color:#0078d4}ul{margin:6px 0}.foot{margin-top:28px;color:#605e5c;font-size:12px}pre{background:#f3f2f1;padding:8px;white-space:pre-wrap;font-size:12px}
@media print{body{background:#fff;padding:0}main{box-shadow:none}}`;

function linksHtml(kind, name) {
  const { links } = portalLinks(kind, { name });
  return links.map(l => `<a href="${safeUrl(l.url)}">${escapeHtml(l.direct ? l.short : `${l.short}: find it under ${l.page}`)}</a>`).join('<br>');
}

export function nextHopHtml(result, { generatedAt = new Date().toISOString(), configLabel = '' } = {}) {
  const m = result.message;
  const inbound = result.direction === 'inbound';
  const facts = [
    ['Direction', inbound ? 'Inbound: from outside to the mailbox' : 'Outbound: from the mailbox to outside'],
    ['From', m.fromName && m.fromName !== m.from ? `"${m.fromName}" <${m.from}>` : m.from],
    ['To', m.to],
    ['Subject', m.originalSubject || '(none)'],
    ...(m.subject !== m.originalSubject ? [['Subject on arrival', m.subject]] : []),
    ['Body', m.body ? (m.body.length > 600 ? `${m.body.slice(0, 600)}…` : m.body) : '(empty)'],
    ['Attachments', m.attachments.length ? m.attachments.map(a => `${a.name} (${sizeText(a.sizeBytes)})`).join(', ') : 'None'],
    ['Size with encoding', sizeText(m.sizeBytes)],
    ['Message type', MESSAGE_KINDS[m.kind] || m.kind],
    ...(inbound ? [['Sending IP (mocked)', m.ip || 'not given'], ['Sender authentication (mocked)', AUTH_RESULTS[m.auth]], ['Spam filter verdict (mocked)', `${VERDICTS[m.verdict]}${m.bcl ? `, bulk complaint level ${m.bcl}` : ''}`], ['Malware (mocked)', m.malware ? 'An attachment is malware' : 'No']] : [['Sensitivity label chosen by the sender', m.label || 'None']]),
  ];
  const steps = result.steps.map(s => `<li class="${escapeHtml(s.tone)}"><span class="n">${s.n}.</span><span class="tag ${escapeHtml(s.tone)}">${TONE[s.tone] || 'INFO'}</span><span class="comp">${escapeHtml(s.component)}</span><span>${escapeHtml(s.text)}</span></li>`).join('');
  const settingRows = result.settings.map(x => `<tr><td>${x.step}</td><td>${escapeHtml(x.component)}</td><td>${escapeHtml(x.name)}</td><td>${escapeHtml(x.property)}</td><td>${escapeHtml(x.value)}</td><td>${escapeHtml(x.section)}</td><td>${linksHtml(x.kind, x.name)}</td></tr>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NextHop prediction: ${escapeHtml(result.outcome)}</title><style>${CSS}</style></head><body><main>`
    + '<h1>NextHop: what Exchange Online would do with this message</h1>'
    + `<p class="meta">Predicted from configuration only. Nothing was sent and no DNS was looked up. Made by Exchange 360 on ${escapeHtml(generatedAt.slice(0, 16).replace('T', ' '))} UTC.</p>`
    + (result.source === 'sample' ? '<p class="sample"><strong>Sample topology.</strong> This used the fictional Contoso configuration built into Exchange 360, not a real tenant.</p>' : `<p class="meta">Configuration: ${escapeHtml(configLabel || `export of ${result.tenant || 'a tenant'}`)}${result.generatedAt ? `, exported ${escapeHtml(String(result.generatedAt).slice(0, 10))}` : ''}.</p>`)
    + `<div class="outcome ${escapeHtml(result.tone)}"><strong>Outcome:</strong> ${escapeHtml(result.outcome)}${result.encrypted && !/encrypted/.test(result.outcome) ? ' The message is encrypted.' : ''}</div>`
    + `<h2>The test message</h2><table class="facts"><tbody>${facts.map(([k, v]) => `<tr><th scope="row">${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`).join('')}</tbody></table>`
    + `<h2>What happens, step by step</h2><ol class="steps">${steps}</ol>`
    + (result.copies.length ? `<h2>Copies and reports</h2><table><thead><tr><th>Sent to</th><th>Why</th></tr></thead><tbody>${result.copies.map(c => `<tr><td>${escapeHtml(c.to)}</td><td>${escapeHtml(c.why)}</td></tr>`).join('')}</tbody></table>` : '')
    + (result.notes.length ? `<h2>Also</h2><ul>${result.notes.map(n => `<li>${escapeHtml(n)}</li>`).join('')}</ul>` : '')
    + `<h2>Settings that caused it</h2>${settingRows ? `<table><thead><tr><th>Step</th><th>Component</th><th>Object</th><th>Setting</th><th>Value</th><th>Export section</th><th>Where it is changed</th></tr></thead><tbody>${settingRows}</tbody></table>` : '<p>No setting acted on this message.</p>'}`
    + (result.unknowns.length ? `<h2>What NextHop could not predict</h2><ul>${result.unknowns.map(u => `<li>${escapeHtml(u)}</li>`).join('')}</ul>` : '')
    + '<h2>What NextHop does not cover</h2><ul><li>DNS: MX, SPF, DKIM, DMARC and MTA-STS of the outside domain. Its authentication result is the mocked value above.</li><li>Microsoft\'s own content scoring and IP reputation. The spam verdict is the mocked value above.</li><li>On-premises Exchange and hybrid routing beyond the connectors in the configuration.</li></ul>'
    + '<p class="foot">Exchange 360 NextHop. Read-only: no message was sent and nothing in any tenant was changed. Confidential when made from a real export: it names tenant settings and addresses.</p>'
    + '</main></body></html>';
}

// Quoted-printable (RFC 2045) from UTF-8 bytes, CRLF line ends, lines no longer than 76 characters.
export function quotedPrintable(text) {
  const bytes = new TextEncoder().encode(String(text).replace(/\r?\n/g, '\r\n'));
  const out = [];
  let line = '';
  const hex = b => `=${b.toString(16).toUpperCase().padStart(2, '0')}`;
  const push = token => { if (line.length + token.length > 75) { out.push(`${line}=`); line = ''; } line += token; };
  const endLine = () => { if (/[ \t]$/.test(line)) { const last = line.charCodeAt(line.length - 1); line = line.slice(0, -1); push(hex(last)); } out.push(line); line = ''; };
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b === 0x0d && bytes[i + 1] === 0x0a) { endLine(); i++; continue; }
    push((b >= 33 && b <= 126 && b !== 61) || b === 32 || b === 9 ? String.fromCharCode(b) : hex(b));
  }
  endLine();
  return out.join('\r\n');
}

export function nextHopMhtml(result, { generatedAt = new Date().toISOString(), configLabel = '', boundary = `----=_NextHop_${Date.now().toString(36)}` } = {}) {
  return [
    'From: <Saved by Exchange 360>',
    `Subject: NextHop prediction: ${String(result.outcome).replace(/[\r\n]+/g, ' ').replace(/[^\x20-\x7e]/g, '?')}`,
    `Date: ${new Date(generatedAt).toUTCString()}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/related; type="text/html"; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="utf-8"',
    'Content-Transfer-Encoding: quoted-printable',
    'Content-Location: https://ex360.local/nexthop/prediction.html',
    '',
    quotedPrintable(nextHopHtml(result, { generatedAt, configLabel })),
    '',
    `--${boundary}--`,
    '',
  ].join('\r\n');
}

export function nextHopFileName(result, generatedAt = new Date().toISOString()) {
  const who = String(result.message.to || 'message').replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 40);
  return `Ex360-NextHop-${result.direction}-${who}-${generatedAt.slice(0, 10)}${result.source === 'sample' ? '-SAMPLE' : ''}.mhtml`;
}
