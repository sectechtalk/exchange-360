// A small PDF writer with no third-party packages: standard fonts (Helvetica, Helvetica-Bold, Courier),
// text wrapping with real glyph widths, tables that break across pages, link annotations, bookmarks
// and "Page n of N" footers. Enough for a readable report, nothing more.
import { REGULAR, BOLD } from './pdf-fonts.js';

const WIN = { 0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f };

// Unicode text to WinAnsi bytes (as a latin1 string). Characters the standard fonts cannot draw become "?".
export function winAnsi(value) {
  let out = '';
  for (const ch of String(value ?? '')) {
    const code = ch.codePointAt(0);
    if (code === 9) out += '    ';
    else if (code === 10) out += '\n';
    else if (code >= 0x20 && code <= 0x7e) out += ch;
    else if (code >= 0xa0 && code <= 0xff) out += String.fromCharCode(code);
    else if (WIN[code]) out += String.fromCharCode(WIN[code]);
    else if (code === 0x2192) out += '->';
    else if (code === 0x2713 || code === 0x2714) out += 'Yes';
    else if (code === 0x2212) out += '-';
    else if (code < 0x20) out += ' ';
    else out += '?';
  }
  return out;
}

function escape(latin) { return latin.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/[\x80-\xff]/g, c => `\\${c.charCodeAt(0).toString(8).padStart(3, '0')}`); }
const num = n => (Math.round(n * 100) / 100).toString();

export function textWidth(latin, size, font = 'regular') {
  if (font === 'mono') return latin.length * 600 * size / 1000;
  const table = font === 'bold' ? BOLD : REGULAR;
  let w = 0;
  for (let i = 0; i < latin.length; i += 1) { const c = latin.charCodeAt(i); w += c >= 32 ? table[c - 32] || 556 : 0; }
  return w * size / 1000;
}

// Wrap text to a width. Keeps the caller's line breaks, breaks on spaces, and splits words longer than a line.
export function wrap(value, width, size, font = 'regular') {
  const lines = [];
  for (const para of winAnsi(value).split('\n')) {
    const words = para.split(/ +/);
    let line = '';
    for (let word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (textWidth(candidate, size, font) <= width) { line = candidate; continue; }
      if (line) lines.push(line);
      while (textWidth(word, size, font) > width && word.length > 1) {
        let cut = word.length - 1;
        while (cut > 1 && textWidth(word.slice(0, cut), size, font) > width) cut -= 1;
        lines.push(word.slice(0, cut));
        word = word.slice(cut);
      }
      line = word;
    }
    lines.push(line);
  }
  return lines;
}

const COLORS = {
  text: [0.1, 0.1, 0.12], muted: [0.38, 0.4, 0.44], accent: [0.04, 0.33, 0.62], rule: [0.84, 0.86, 0.89], head: [0.93, 0.94, 0.96],
  high: [0.72, 0.07, 0.1], medium: [0.66, 0.33, 0.0], low: [0.38, 0.4, 0.44], info: [0.04, 0.33, 0.62], ok: [0.08, 0.45, 0.2], warn: [0.66, 0.33, 0.0],
  deniedFill: [0.99, 0.94, 0.94], warnFill: [1, 0.97, 0.92],
};
const rgb = (c, stroke) => `${c.map(num).join(' ')} ${stroke ? 'RG' : 'rg'}`;

export class PdfDocument {
  constructor({ title = 'Report', author = 'Exchange 360', subject = '', width = 612, height = 792, margin = 50 } = {}) {
    Object.assign(this, { title, author, subject, width, height, margin });
    this.pages = [];
    this.outline = [];
    this.top = height - margin;
    this.bottom = margin + 28;
    this.addPage();
  }
  get contentWidth() { return this.width - this.margin * 2; }
  addPage() { this.page = { ops: [], links: [] }; this.pages.push(this.page); this.y = this.top; }
  ensure(height) { if (this.y - height < this.bottom) this.addPage(); }
  text(x, y, latin, { size = 10, font = 'regular', color = COLORS.text } = {}) {
    const f = font === 'bold' ? 'F2' : font === 'mono' ? 'F3' : 'F1';
    this.page.ops.push(`BT ${rgb(color)} /${f} ${num(size)} Tf ${num(x)} ${num(y)} Td (${escape(latin)}) Tj ET`);
  }
  rect(x, y, w, h, { fill, stroke }) {
    const ops = [];
    if (fill) ops.push(rgb(fill));
    if (stroke) ops.push(rgb(stroke, true), '0.6 w');
    ops.push(`${num(x)} ${num(y)} ${num(w)} ${num(h)} re ${fill && stroke ? 'B' : fill ? 'f' : 'S'}`);
    this.page.ops.push(ops.join(' '));
  }
  line(x1, y1, x2, y2, color = COLORS.rule, width = 0.5) { this.page.ops.push(`${rgb(color, true)} ${num(width)} w ${num(x1)} ${num(y1)} m ${num(x2)} ${num(y2)} l S`); }
  link(x, y, w, h, url) { if (/^https:\/\//.test(url)) this.page.links.push({ rect: [x, y, x + w, y + h], url }); }
  bookmark(title) { this.outline.push({ title: winAnsi(title), page: this.pages.length - 1, y: this.y + 16 }); }

  // Draw wrapped text at the cursor and move down. Returns the lines drawn.
  paragraph(value, { size = 10, font = 'regular', color = COLORS.text, indent = 0, width, leading = 1.3, after = 4, url } = {}) {
    const w = width || this.contentWidth - indent;
    const lines = wrap(value, w, size, font);
    for (const line of lines) {
      this.ensure(size * leading);
      this.y -= size * leading;
      this.text(this.margin + indent, this.y + size * 0.25, line, { size, font, color });
      if (url) this.link(this.margin + indent, this.y, textWidth(line, size, font), size * leading, url);
    }
    this.y -= after;
    return lines;
  }

  table(columns, rows, { size = 8, widths, header = true } = {}) {
    const pad = 4;
    const W = this.contentWidth;
    const n = columns.length;
    let colW = widths;
    if (!colW) {
      const cells = [columns, ...rows];
      const natural = Array.from({ length: n }, (_, i) => Math.min(Math.max(...cells.map(r => Math.max(...String(r[i] ?? '').split('\n').map(t => textWidth(winAnsi(t), size, i === 0 ? 'bold' : 'regular'))))) + pad * 2, 280));
      const minimum = Array.from({ length: n }, (_, i) => Math.min(Math.max(...cells.map(r => Math.max(0, ...winAnsi(r[i] ?? '').split(/\s+/).map(t => textWidth(t, size, 'bold'))))) + pad * 2, 110, natural[i]));
      const sumNat = natural.reduce((a, b) => a + b, 0);
      if (sumNat <= W) colW = natural.map(v => v * W / sumNat);
      else {
        const sumMin = minimum.reduce((a, b) => a + b, 0);
        const spare = Math.max(0, W - sumMin);
        const extra = natural.map((v, i) => v - minimum[i]);
        const sumExtra = extra.reduce((a, b) => a + b, 0) || 1;
        colW = minimum.map((m, i) => m + spare * extra[i] / sumExtra);
        const total = colW.reduce((a, b) => a + b, 0);
        colW = colW.map(v => v * W / total);
      }
    }
    const lead = size * 1.25;
    const drawRow = (cells, isHead) => {
      const wrapped = cells.map((c, i) => wrap(c ?? '', colW[i] - pad * 2, size, isHead || i === 0 ? 'bold' : 'regular').slice(0, 80));
      const h = Math.max(...wrapped.map(l => l.length)) * lead + pad * 2;
      return { wrapped, h };
    };
    const head = header ? drawRow(columns, true) : null;
    const paint = ({ wrapped, h }, isHead) => {
      let x = this.margin;
      if (isHead) this.rect(this.margin, this.y - h, W, h, { fill: COLORS.head });
      wrapped.forEach((lines, i) => {
        lines.forEach((line, j) => this.text(x + pad, this.y - pad - (j + 1) * lead + size * 0.28, line, { size, font: isHead || i === 0 ? 'bold' : 'regular', color: isHead ? COLORS.muted : COLORS.text }));
        x += colW[i];
      });
      this.y -= h;
      this.line(this.margin, this.y, this.margin + W, this.y);
    };
    this.ensure((head?.h || 0) + lead * 2 + pad * 2);
    if (head) paint(head, true);
    for (const row of rows) {
      const r = drawRow(row, false);
      if (this.y - r.h < this.bottom) { this.addPage(); if (head) paint(head, true); }
      paint(r, false);
    }
    this.y -= 8;
  }

  // Assemble the file. compress, when given, is a function(Buffer) -> Buffer (zlib deflate).
  toBuffer({ footer, compress } = {}) {
    const objects = [];
    const add = body => { objects.push(body); return objects.length; };
    const catalogId = add(null);
    const pagesId = add(null);
    const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const f3 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>');
    const total = this.pages.length;
    const pageIds = [];
    this.pages.forEach((page, i) => {
      if (footer) {
        const saved = this.page;
        this.page = page;
        footer(this, i + 1, total);
        this.page = saved;
      }
      const raw = page.ops.join('\n');
      let stream = Buffer.from(raw, 'latin1');
      let filter = '';
      if (compress) { stream = compress(stream); filter = ' /Filter /FlateDecode'; }
      const contentId = add({ head: `<< /Length ${stream.length}${filter} >>`, stream });
      const annots = page.links.map(l => add(`<< /Type /Annot /Subtype /Link /Rect [${l.rect.map(num).join(' ')}] /Border [0 0 0] /A << /S /URI /URI (${escape(winAnsi(l.url))}) >> >>`));
      const pageId = add(null);
      objects[pageId - 1] = `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${this.width} ${this.height}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R /F3 ${f3} 0 R >> >> /Contents ${contentId} 0 R${annots.length ? ` /Annots [${annots.map(a => `${a} 0 R`).join(' ')}]` : ''} >>`;
      pageIds.push(pageId);
    });
    objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
    let outlineRef = '';
    if (this.outline.length) {
      const rootId = add(null);
      const itemIds = this.outline.map(() => add(null));
      this.outline.forEach((item, i) => {
        objects[itemIds[i] - 1] = `<< /Title (${escape(item.title)}) /Parent ${rootId} 0 R${i ? ` /Prev ${itemIds[i - 1]} 0 R` : ''}${i < itemIds.length - 1 ? ` /Next ${itemIds[i + 1]} 0 R` : ''} /Dest [${pageIds[item.page]} 0 R /XYZ 0 ${num(item.y)} 0] >>`;
      });
      objects[rootId - 1] = `<< /Type /Outlines /First ${itemIds[0]} 0 R /Last ${itemIds[itemIds.length - 1]} 0 R /Count ${itemIds.length} >>`;
      outlineRef = ` /Outlines ${rootId} 0 R /PageMode /UseOutlines`;
    }
    objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R${outlineRef} >>`;
    const info = add(`<< /Title (${escape(winAnsi(this.title))}) /Author (${escape(winAnsi(this.author))}) /Subject (${escape(winAnsi(this.subject))}) /Producer (Exchange 360) >>`);
    const parts = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
    const offsets = [];
    let length = parts[0].length;
    objects.forEach((body, i) => {
      offsets.push(length);
      const chunk = typeof body === 'string'
        ? Buffer.from(`${i + 1} 0 obj\n${body}\nendobj\n`, 'latin1')
        : Buffer.concat([Buffer.from(`${i + 1} 0 obj\n${body.head}\nstream\n`, 'latin1'), body.stream, Buffer.from('\nendstream\nendobj\n', 'latin1')]);
      parts.push(chunk);
      length += chunk.length;
    });
    const xref = [`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`, ...offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`)].join('');
    parts.push(Buffer.from(`${xref}trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R /Info ${info} 0 R >>\nstartxref\n${length}\n%%EOF\n`, 'latin1'));
    return Buffer.concat(parts);
  }
}

export { COLORS };
