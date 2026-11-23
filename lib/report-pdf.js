// Lays the single-mailbox report model (lib/report.js) out as a PDF. Same sections, same words, same order as the page.
import { PdfDocument, COLORS, winAnsi, wrap, textWidth } from './pdf.js';

const TONE_LABEL = { high: 'HIGH', medium: 'CHECK', low: 'LOW', info: 'INFO', ok: 'OK' };
// Organization report: configured / not configured tags.
const STATUS_TAG = { configured: ['CONFIGURED', 'info'], default: ['NOT CONFIGURED', 'muted'], empty: ['NOT CONFIGURED', 'muted'], reference: ['VALUE', 'muted'], missing: ['NOT RETURNED', 'medium'] };

function settingsRows(doc, b) {
  if (b.title) { doc.ensure(40); doc.paragraph(b.title, { size: 10, font: 'bold', after: 3 }); }
  const tagW = 70;
  const labelW = (doc.contentWidth - tagW) * 0.42;
  const valueW = doc.contentWidth - tagW - labelW - 12;
  for (const r of b.rows) {
    const left = wrap(r.label, labelW, 8.5, 'regular');
    const right = wrap(r.value, valueW, 8.5, 'bold');
    const extra = r.note ? wrap(r.note, valueW, 7.5, 'regular') : [];
    const h = Math.max(left.length, right.length + extra.length) * 10.5 + 5;
    doc.ensure(h);
    const top = doc.y;
    const [tag, tone] = STATUS_TAG[r.status] || ['', 'muted'];
    doc.text(doc.margin, top - 9.5, tag, { size: 6.5, font: 'bold', color: COLORS[tone] || COLORS.muted });
    left.forEach((l, i) => doc.text(doc.margin + tagW, top - 9.5 - i * 10.5, l, { size: 8.5, color: COLORS.text }));
    right.forEach((l, i) => doc.text(doc.margin + tagW + labelW + 12, top - 9.5 - i * 10.5, l, { size: 8.5, font: 'bold' }));
    extra.forEach((l, i) => doc.text(doc.margin + tagW + labelW + 12, top - 9.5 - (right.length + i) * 10.5, l, { size: 7.5, color: COLORS.muted }));
    doc.y = top - h;
    doc.line(doc.margin, doc.y + 1, doc.margin + doc.contentWidth, doc.y + 1);
  }
  doc.y -= 8;
}

function block(doc, b, opts = {}) {
  if (b.type === 'settings') settingsRows(doc, b);
  else if (b.type === 'raw') {
    if (!opts.raw) return;
    doc.ensure(30);
    doc.paragraph(b.title, { size: 8.5, font: 'bold', color: COLORS.muted, after: 2 });
    doc.table(['Property', 'Value'], b.rows, { size: 7 });
  } else if (b.type === 'facts') {
    const labelW = doc.contentWidth * 0.36;
    const valueW = doc.contentWidth - labelW - 8;
    for (const [label, value, note] of b.rows) {
      const left = wrap(label, labelW, 9, 'regular');
      const right = wrap(value, valueW, 9, 'bold');
      const extra = note ? wrap(note, valueW, 8, 'regular') : [];
      const h = Math.max(left.length, right.length + extra.length) * 11.5 + 5;
      doc.ensure(h);
      const top = doc.y;
      left.forEach((l, i) => doc.text(doc.margin, top - 10 - i * 11.5, l, { size: 9, color: COLORS.muted }));
      right.forEach((l, i) => doc.text(doc.margin + labelW + 8, top - 10 - i * 11.5, l, { size: 9, font: 'bold' }));
      extra.forEach((l, i) => doc.text(doc.margin + labelW + 8, top - 10 - (right.length + i) * 11.5, l, { size: 8, color: COLORS.muted }));
      doc.y = top - h;
      doc.line(doc.margin, doc.y + 1, doc.margin + doc.contentWidth, doc.y + 1);
    }
    doc.y -= 8;
  } else if (b.type === 'table') {
    doc.table(b.columns, b.rows, { size: b.columns.length > 4 ? 7.5 : 8 });
  } else if (b.type === 'text') {
    if (b.tone === 'warn') {
      const lines = wrap(b.text, doc.contentWidth - 16, 9.5);
      const h = lines.length * 12.5 + 10;
      doc.ensure(h);
      doc.rect(doc.margin, doc.y - h, doc.contentWidth, h, { fill: COLORS.warnFill });
      doc.rect(doc.margin, doc.y - h, 3, h, { fill: COLORS.warn });
      lines.forEach((l, i) => doc.text(doc.margin + 10, doc.y - 14 - i * 12.5, l, { size: 9.5 }));
      doc.y -= h + 8;
    } else doc.paragraph(b.text, { size: 9.5, after: 6 });
  } else if (b.type === 'list') {
    if (b.title) { doc.ensure(30); doc.paragraph(b.title, { size: 10, font: 'bold', after: 2 }); }
    for (const item of b.items) {
      const tag = TONE_LABEL[item.tone] || '';
      const indent = tag ? 46 : 12;
      const lines = wrap(item.text, doc.contentWidth - indent, 9.5);
      doc.ensure(lines.length * 12.5 + 3);
      const top = doc.y;
      if (tag) doc.text(doc.margin, top - 10, tag, { size: 7.5, font: 'bold', color: COLORS[item.tone] || COLORS.muted });
      else doc.text(doc.margin + 2, top - 10, '\x95', { size: 9.5, color: COLORS.muted });
      lines.forEach((l, i) => doc.text(doc.margin + indent, top - 10 - i * 12.5, l, { size: 9.5, color: item.tone === 'muted' ? COLORS.muted : COLORS.text }));
      doc.y = top - lines.length * 12.5 - 3;
    }
    doc.y -= 6;
  } else if (b.type === 'denied') {
    const body = [b.message, b.permission ? `Permission: ${b.permission}. Role: ${b.role || '—'}.` : '', b.signIn ? `In Ex360, use the Sign in button for ${b.signIn === 'exchange' ? 'Exchange' : b.signIn === 'compliance' ? 'Compliance PowerShell' : 'Purview Graph'} at the top of the page, then build the report again.` : ''].filter(Boolean).join('\n');
    const lines = wrap(body, doc.contentWidth - 16, 8.5);
    const h = lines.length * 11 + 24;
    doc.ensure(h);
    doc.rect(doc.margin, doc.y - h, doc.contentWidth, h, { fill: COLORS.deniedFill });
    doc.rect(doc.margin, doc.y - h, 3, h, { fill: COLORS.high });
    doc.text(doc.margin + 10, doc.y - 13, winAnsi(String(b.label || 'Not authorized').toUpperCase()), { size: 9, font: 'bold', color: COLORS.high });
    lines.forEach((l, i) => doc.text(doc.margin + 10, doc.y - 26 - i * 11, l, { size: 8.5 }));
    doc.y -= h + 8;
  }
}

function render(report, toc, opts = {}) {
  const org = report.kind === 'org';
  const doc = new PdfDocument({ title: report.title, subject: org ? `Every email setting in ${report.subject.displayName}, configured or not` : `Everything that affects ${report.subject.address}'s email`, author: 'Exchange 360' });
  // Title block
  doc.paragraph(org ? 'Exchange 360  ·  Organization report' : 'Exchange 360  ·  Single mailbox report', { size: 9, font: 'bold', color: COLORS.accent, after: 2 });
  doc.paragraph(report.subject.displayName || report.subject.address, { size: 22, font: 'bold', leading: 1.2, after: 0 });
  doc.paragraph(report.subject.address, { size: 12, color: COLORS.muted, after: 8 });
  const meta = [
    ['Generated', report.generatedText],
    ['Read as', report.signedInAs || '—'],
    ['Data', report.source === 'demo' ? 'Fictional Contoso demo data, not a real tenant' : 'Live, read-only, from your tenant with your own permissions'],
  ];
  for (const [k, v] of meta) {
    doc.ensure(13);
    doc.y -= 13;
    doc.text(doc.margin, doc.y, winAnsi(k), { size: 9, color: COLORS.muted });
    doc.text(doc.margin + 70, doc.y, winAnsi(v), { size: 9, font: 'bold' });
  }
  doc.y -= 8;
  if (org) doc.paragraph(`CONFIGURED means the setting was changed from Microsoft's default or the feature is set up. NOT CONFIGURED means it still has Microsoft's default or is blank. VALUE lines have no single Microsoft default to compare with.${opts.raw ? ' Every property each cmdlet returned is listed after its explained settings.' : ' Every raw property each cmdlet returned is on the page and in the full PDF.'}`, { size: 8.5, color: COLORS.text, after: 6 });
  doc.paragraph('This report holds configuration data from your Microsoft 365 tenant. Handle it as confidential. Ex360 did not change anything to produce it. Anything Ex360 could not read says so where it would have been.', { size: 8.5, color: COLORS.muted, after: 10 });
  // Contents
  doc.paragraph('Contents', { size: 11, font: 'bold', after: 2 });
  report.sections.forEach((s, i) => {
    doc.ensure(12);
    doc.y -= 12;
    const page = toc ? String(toc[i]) : '';
    doc.text(doc.margin + 6, doc.y, winAnsi(`${i + 1}.  ${s.title}`), { size: 9 });
    doc.text(doc.margin + doc.contentWidth - textWidth(page, 9), doc.y, page, { size: 9, color: COLORS.muted });
  });
  doc.y -= 10;
  const pages = [];
  report.sections.forEach((s, i) => {
    if (i > 0 || doc.y < doc.top - 200) doc.ensure(90); else doc.ensure(60);
    doc.y -= 10;
    doc.bookmark(`${i + 1}. ${s.title}`);
    pages.push(doc.pages.length);
    doc.paragraph(`${i + 1}. ${s.title}`, { size: 15, font: 'bold', color: COLORS.accent, after: 1 });
    if (s.intro) doc.paragraph(s.intro, { size: 9, color: COLORS.muted, after: 6 });
    for (const b of s.blocks) block(doc, b, opts);
    if (s.portals?.length) {
      doc.ensure(40);
      doc.paragraph('Where to change this', { size: 9, font: 'bold', color: COLORS.muted, after: 1 });
      for (const p of s.portals) {
        const link = p.links[0];
        doc.paragraph(`${p.title}: ${link.name}`, { size: 8.5, color: COLORS.accent, indent: 8, after: 0, url: link.url });
        doc.paragraph(link.url, { size: 7.5, color: COLORS.muted, indent: 8, after: 0, url: link.url });
        const others = p.links.slice(1);
        if (others.length) doc.paragraph(`Also: ${others.map(o => o.name).join('; ')}`, { size: 7.5, color: COLORS.muted, indent: 8, after: 0 });
        if (p.powershell) doc.paragraph(`PowerShell (read-only): ${p.powershell}`, { size: 7, font: 'mono', color: COLORS.muted, indent: 8, after: 3 });
      }
    }
    doc.y -= 6;
  });
  return { doc, pages };
}

export function reportPdf(report, { compress, raw = false } = {}) {
  const first = render(report, null, { raw });
  const { doc } = render(report, first.pages, { raw });
  const left = winAnsi(`Exchange 360  ·  ${report.subject.address}  ·  ${report.generatedText}`);
  return doc.toBuffer({
    compress,
    footer: (d, n, total) => {
      d.line(d.margin, d.margin + 16, d.width - d.margin, d.margin + 16);
      d.text(d.margin, d.margin + 4, left, { size: 7.5, color: COLORS.muted });
      const right = `Page ${n} of ${total}`;
      d.text(d.width - d.margin - textWidth(right, 7.5), d.margin + 4, right, { size: 7.5, color: COLORS.muted });
      d.text(d.margin, d.margin - 7, winAnsi('Confidential: contains tenant configuration data. Read-only report; nothing was changed.'), { size: 6.5, color: COLORS.muted });
    },
  });
}

export function reportFileName(report) {
  const who = String(report.subject.address || report.subject.displayName || 'mailbox').split('@')[0].replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 40) || 'mailbox';
  const day = String(report.generatedAt || '').slice(0, 10) || 'report';
  return `Ex360-mailbox-report-${who}-${day}${report.source === 'demo' ? '-DEMO' : ''}.pdf`;
}
