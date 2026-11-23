// The single-mailbox report model (lib/report.js) as one self-contained web archive (.mhtml): the same
// sections, words and order as the page and the PDF. It opens in Edge and Chrome, and Word can open it too.
// Built in memory; Ex360 never writes it to disk.
const TONE_LABEL = { high: 'HIGH', medium: 'CHECK', low: 'LOW', info: 'INFO', ok: 'OK' };

export function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
const safeUrl = url => (/^https:\/\//i.test(String(url || '')) ? escapeHtml(url) : '#');

function blockHtml(b) {
  if (b.type === 'facts') {
    return `<table class="facts"><tbody>${b.rows.map(([label, value, hint]) => `<tr><th scope="row">${escapeHtml(label)}</th><td><strong>${escapeHtml(value)}</strong>${hint ? `<small>${escapeHtml(hint)}</small>` : ''}</td></tr>`).join('')}</tbody></table>`;
  }
  if (b.type === 'table') {
    return `<table class="grid"><thead><tr>${b.columns.map(c => `<th scope="col">${escapeHtml(c)}</th>`).join('')}</tr></thead><tbody>${b.rows.map(r => `<tr>${r.map(c => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }
  if (b.type === 'text') return `<p class="${b.tone === 'warn' ? 'warn' : ''}">${escapeHtml(b.text)}</p>`;
  if (b.type === 'denied') return `<div class="denied"><strong>${escapeHtml(b.label || 'Not authorized')}</strong><p>${escapeHtml(b.message)}</p>${b.permission ? `<p>Permission: ${escapeHtml(b.permission)}. Role: ${escapeHtml(b.role)}.</p>` : ''}</div>`;
  if (b.type === 'list') {
    const items = b.items.map(i => `<li>${TONE_LABEL[i.tone] ? `<span class="tag ${i.tone}">${TONE_LABEL[i.tone]}</span> ` : ''}${escapeHtml(i.text)}</li>`).join('');
    return `${b.title ? `<h3>${escapeHtml(b.title)}</h3>` : ''}<ul>${items}</ul>`;
  }
  return '';
}

function portalsHtml(list) {
  if (!list?.length) return '';
  return `<div class="portals"><h3>Where to change this</h3>${list.map(item => `<h4>${escapeHtml(item.title)}</h4><ul>${item.links.map((l, i) => `<li><a href="${safeUrl(l.url)}">${i === 0 ? 'Open' : 'Also'}: ${escapeHtml(l.name)}</a></li>`).join('')}</ul><pre>${escapeHtml(item.powershell)}</pre>`).join('')}</div>`;
}

const CSS = `body{font-family:Segoe UI,Arial,sans-serif;color:#1f2933;margin:32px auto;max-width:960px;padding:0 16px;line-height:1.45}
h1{font-size:24px;margin:0 0 4px}h2{font-size:18px;margin:28px 0 6px;border-bottom:1px solid #d5dbe1;padding-bottom:4px}h3{font-size:15px;margin:14px 0 6px}h4{font-size:13px;margin:10px 0 4px}
.meta,.intro,small{color:#52606d}small{display:block;font-size:12px}table{border-collapse:collapse;width:100%;margin:8px 0;font-size:13px}
th,td{border-bottom:1px solid #e4e7eb;padding:6px 8px;text-align:left;vertical-align:top}.facts th{width:36%;font-weight:500;color:#3e4c59}.grid thead th{background:#f0f4f8}
.tag{font-size:11px;font-weight:600;padding:1px 6px;border-radius:4px;background:#e4e7eb}.tag.high{background:#fde2e2;color:#8a1c1c}.tag.medium{background:#fff3c4;color:#7a5800}.tag.ok{background:#dcf5e3;color:#14532d}
.warn,.denied{background:#fff8e1;border-left:4px solid #b7791f;padding:8px 12px}pre{background:#f0f4f8;padding:8px;white-space:pre-wrap;font-size:12px}
.foot{margin-top:32px;color:#52606d;font-size:12px}`;

export function reportHtml(report) {
  const toc = report.sections.map((s, i) => `<li><a href="#report-${escapeHtml(s.id)}">${i + 1}. ${escapeHtml(s.title)}</a></li>`).join('');
  const body = report.sections.map((s, i) => `<section id="report-${escapeHtml(s.id)}"><h2>${i + 1}. ${escapeHtml(s.title)}</h2>${s.intro ? `<p class="intro">${escapeHtml(s.intro)}</p>` : ''}${s.blocks.map(blockHtml).join('')}${portalsHtml(s.portals)}</section>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(report.title)}</title><style>${CSS}</style></head><body>`
    + `<h1>${escapeHtml(report.subject.displayName || report.subject.address)}</h1>`
    + `<p class="meta">${escapeHtml(report.subject.address)}. Generated ${escapeHtml(report.generatedText)}. Read as ${escapeHtml(report.signedInAs || 'nobody')}. ${report.source === 'demo' ? 'Fictional Contoso demo data.' : 'Live and read-only.'}</p>`
    + `<ol>${toc}</ol>${body}`
    + '<p class="foot">Exchange 360. Confidential: contains tenant configuration data. Read-only report; nothing was changed.</p></body></html>';
}

// MHTML (RFC 2557): one multipart/related message whose root part is the HTML page. Quoted-printable keeps
// it readable and line lengths legal; the page has no images, so it is a single part.
export function quotedPrintable(text) {
  const bytes = Buffer.from(String(text).replace(/\r?\n/g, '\r\n'), 'utf8');
  const out = [];
  let line = '';
  const push = token => {
    if (line.length + token.length > 75) { out.push(`${line}=`); line = ''; }
    line += token;
  };
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b === 0x0d && bytes[i + 1] === 0x0a) {
      if (/[ \t]$/.test(line)) { const last = line.slice(-1); line = line.slice(0, -1); push(`=${last.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`); }
      out.push(line); line = ''; i++; continue;
    }
    const printable = (b >= 33 && b <= 126 && b !== 61) || b === 32 || b === 9;
    push(printable ? String.fromCharCode(b) : `=${b.toString(16).toUpperCase().padStart(2, '0')}`);
  }
  if (/[ \t]$/.test(line)) { const last = line.slice(-1); line = line.slice(0, -1); push(`=${last.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`); }
  out.push(line);
  return out.join('\r\n');
}

export function reportMhtml(report, { boundary = `----=_Ex360_${Date.now().toString(36)}` } = {}) {
  const location = `https://ex360.local/report/${encodeURIComponent(report.subject.address || 'mailbox')}.html`;
  return [
    'From: <Saved by Exchange 360>',
    `Subject: ${String(report.title || 'Mailbox report').replace(/[\r\n]+/g, ' ')}`,
    `Date: ${new Date(report.generatedAt || Date.now()).toUTCString()}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/related; type="text/html"; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="utf-8"',
    'Content-Transfer-Encoding: quoted-printable',
    `Content-Location: ${location}`,
    '',
    quotedPrintable(reportHtml(report)),
    '',
    `--${boundary}--`,
    '',
  ].join('\r\n');
}

export function reportMhtmlFileName(report) {
  const who = String(report.subject.address || report.subject.displayName || 'mailbox').split('@')[0].replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 40) || 'mailbox';
  const day = String(report.generatedAt || '').slice(0, 10) || 'report';
  return `Ex360-mailbox-report-${who}-${day}${report.source === 'demo' ? '-DEMO' : ''}.mhtml`;
}
