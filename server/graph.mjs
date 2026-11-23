import { classifyStatus } from '../lib/permissions.js';

export async function graphGet(token, path, call) {
  if (!token) return { ok: false, ...classifyStatus(401, 'no token', call) };
  const url = path.startsWith('https://') ? path : `https://graph.microsoft.com/v1.0${path}`;
  const res = await fetch(url, { method: 'GET', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  if (!res.ok) return { ok: false, status: res.status, ...classifyStatus(res.status, json || text, call), body: json };
  return { ok: true, status: res.status, json };
}

export async function graphList(token, path, call, maxPages = 5) {
  const rows = [];
  let next = path;
  let pages = 0;
  while (next && pages < maxPages) {
    const res = await graphGet(token, next, call);
    if (!res.ok) return res;
    rows.push(...(res.json.value || []));
    next = res.json['@odata.nextLink'] || '';
    pages += 1;
  }
  return { ok: true, value: rows, truncated: Boolean(next) };
}
