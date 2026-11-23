// .eml is RFC 5322 text. .msg is an Outlook OLE compound file. v1 reads the transport
// headers stream (property 0x007D) when it can, and falls back to UTF-16 text that looks like headers.
import { parseHeaderBlock } from './analyzer.js';

export function splitMessage(raw) {
  const text = String(raw || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const idx = text.indexOf('\n\n');
  return { headers: idx === -1 ? text : text.slice(0, idx), body: idx === -1 ? '' : text.slice(idx + 2) };
}

export function parseEml(raw) {
  const { headers, body } = splitMessage(raw);
  const parsed = parseHeaderBlock(headers);
  if (!parsed.length) throw new Error('This file has no RFC 5322 headers. Paste the header block, or choose a .eml file.');
  return { kind: 'eml', headers, body: body.slice(0, 4000), headerCount: parsed.length };
}

function u8(input) {
  if (input instanceof Uint8Array) return input;
  return new TextEncoder().encode(String(input ?? ''));
}
function viewOf(buf) { return new DataView(buf.buffer, buf.byteOffset, buf.byteLength); }
function i32(buf, off) { return viewOf(buf).getInt32(off, true); }
function u16(buf, off) { return viewOf(buf).getUint16(off, true); }
function u32(buf, off) { return viewOf(buf).getUint32(off, true); }
function concat(parts) {
  const size = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(size);
  let at = 0;
  for (const part of parts) { out.set(part, at); at += part.length; }
  return out;
}
function utf16le(buf, start, len) {
  const end = Math.min(buf.length, start + len);
  let out = '';
  for (let i = start; i + 1 < end; i += 2) out += String.fromCharCode(buf[i] | (buf[i + 1] << 8));
  return out.replace(/\u0000/g, '');
}
function latin1(buf) {
  let out = '';
  for (let i = 0; i < buf.length; i++) out += String.fromCharCode(buf[i]);
  return out;
}

function readCfbSectors(buf) {
  if (buf.length < 512 || buf[0] !== 0xD0 || buf[1] !== 0xCF) return null;
  const sectorSize = 1 << u16(buf, 0x1E);
  const fatSectors = [];
  for (let i = 0; i < 109; i++) {
    const id = i32(buf, 0x4C + i * 4);
    if (id >= 0) fatSectors.push(id);
  }
  const fat = [];
  for (const id of fatSectors) {
    const off = (id + 1) * sectorSize;
    for (let i = 0; i < sectorSize; i += 4) fat.push(i32(buf, off + i));
  }
  const readChain = start => {
    const parts = [];
    let id = start;
    const seen = new Set();
    while (id >= 0 && !seen.has(id) && id < fat.length) {
      seen.add(id);
      const off = (id + 1) * sectorSize;
      parts.push(buf.subarray(off, Math.min(buf.length, off + sectorSize)));
      id = fat[id];
    }
    return concat(parts);
  };
  const dirStart = i32(buf, 0x30);
  const dir = readChain(dirStart);
  const entries = [];
  for (let off = 0; off + 128 <= dir.length; off += 128) {
    const nameLen = u16(dir, off + 64);
    if (nameLen < 2) continue;
    const name = utf16le(dir, off, nameLen - 2);
    const start = i32(dir, off + 116);
    const size = u32(dir, off + 120);
    entries.push({ name, start, size });
  }
  return { entries, readChain, sectorSize };
}

export function parseMsg(buf) {
  const data = u8(buf);
  const cfb = readCfbSectors(data);
  if (!cfb) throw new Error('This .msg file is not an Outlook OLE document.');
  const headerEntry = cfb.entries.find(e => /__substg1\.0_007D/i.test(e.name));
  let headers = '';
  if (headerEntry) {
    const stream = cfb.readChain(headerEntry.start);
    const slice = stream.subarray(0, Math.min(stream.length, headerEntry.size));
    headers = utf16le(slice, 0, slice.length);
    if (!headers.includes(':')) headers = latin1(slice);
  }
  if (!parseHeaderBlock(headers).length) {
    const text = utf16le(data, 0, data.length);
    const idx = text.search(/Received:/i);
    if (idx === -1) throw new Error('No transport headers were found in this .msg file. Save the message as .eml, or paste the headers.');
    headers = text.slice(idx, idx + 20000);
  }
  return { kind: 'msg', headers, body: '', headerCount: parseHeaderBlock(headers).length };
}

export function parseMessageFile(name, buf) {
  const lower = String(name || '').toLowerCase();
  if (lower.endsWith('.msg')) return parseMsg(buf);
  const text = buf instanceof Uint8Array ? new TextDecoder().decode(buf) : String(buf);
  return parseEml(text);
}
