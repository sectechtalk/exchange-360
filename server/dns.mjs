import { Resolver } from 'node:dns/promises';
import { parseSpf, parseDmarc, parseMx, parseDkimCname, parseMtaSts, parseTlsRpt, parseAutodiscover, summarizeDns } from '../lib/dnsparse.js';

// Each record is read over classic DNS (UDP to 1.1.1.1 and 8.8.8.8) first.
// Inside Docker Desktop the container's port 53 traffic can be answered by
// Docker's own DNS proxy, which can return "no data" for CNAME, TXT and MX even
// when the public record exists. So an empty or failed classic answer is
// checked again over DNS-over-HTTPS (Cloudflare, then Google) before Ex360
// reports a record as missing.

const resolver = new Resolver({ timeout: 3000, tries: 2 });
resolver.setServers(['1.1.1.1', '8.8.8.8']);

const EMPTY = new Set(['ENODATA', 'ENOTFOUND']);
const TYPE_CODE = { CNAME: 5, MX: 15, TXT: 16 };
const DOH = [
  name => `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=`,
  name => `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=`,
];

async function classic(type, name) {
  try {
    if (type === 'TXT') return (await resolver.resolveTxt(name)).map(parts => parts.join(''));
    if (type === 'MX') return (await resolver.resolveMx(name)).map(r => ({ preference: r.priority, exchange: r.exchange }));
    return await resolver.resolveCname(name);
  } catch (err) {
    if (EMPTY.has(err.code)) return [];
    throw err;
  }
}

// TXT data in DoH JSON is one or more quoted strings: "v=spf1 ..." "more".
export function unquoteTxt(data) {
  const parts = [...String(data).matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(m => m[1].replace(/\\(.)/g, '$1'));
  return parts.length ? parts.join('') : String(data);
}

export function parseDohAnswer(type, body) {
  if (!body || (body.Status !== 0 && body.Status !== 3)) throw new Error(`DNS-over-HTTPS status ${body?.Status}`);
  const rows = (body.Answer || []).filter(a => a.type === TYPE_CODE[type]);
  if (type === 'TXT') return rows.map(a => unquoteTxt(a.data));
  if (type === 'MX') return rows.map(a => { const [pref, host] = String(a.data).trim().split(/\s+/); return { preference: Number(pref), exchange: host }; });
  return rows.map(a => String(a.data));
}

async function doh(type, name, fetchImpl = fetch) {
  let last;
  for (const url of DOH) {
    try {
      const res = await fetchImpl(url(name) + type, { headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return parseDohAnswer(type, await res.json());
    } catch (err) { last = err; }
  }
  throw last;
}

export async function lookup(type, name, { classicImpl = classic, dohImpl = doh } = {}) {
  let first = [];
  let firstError;
  try { first = await classicImpl(type, name); } catch (err) { firstError = err; }
  if (first.length) return first;
  try { return await dohImpl(type, name); } catch {
    if (firstError) throw firstError;
    return first;
  }
}

export async function checkDomain(domain, deps) {
  const name = String(domain || '').trim().replace(/\.$/, '').toLowerCase();
  if (!/^[a-z0-9.-]+$/.test(name)) return { ok: false, message: 'That domain name is not valid.' };
  const q = (type, n) => lookup(type, n, deps);
  const [mxRecords, spfTxt, dmarcTxt, sel1, sel2, sts, tls, auto] = await Promise.all([
    q('MX', name), q('TXT', name), q('TXT', `_dmarc.${name}`),
    q('CNAME', `selector1._domainkey.${name}`), q('CNAME', `selector2._domainkey.${name}`),
    q('TXT', `_mta-sts.${name}`), q('TXT', `_smtp._tls.${name}`), q('CNAME', `autodiscover.${name}`),
  ]);
  return {
    ok: true,
    live: true,
    ...summarizeDns(name, {
      mx: parseMx(mxRecords),
      spf: parseSpf(spfTxt),
      dmarc: parseDmarc(dmarcTxt),
      dkim: [parseDkimCname('selector1', sel1), parseDkimCname('selector2', sel2)],
      mtaSts: parseMtaSts(sts),
      tlsRpt: parseTlsRpt(tls),
      autodiscover: parseAutodiscover(auto),
    }),
  };
}
