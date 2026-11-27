import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync, writeFileSync, chmodSync, readFileSync } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import {
  DEFAULT_GRAPH_SCOPES, EXO_SCOPE, IPPS_SCOPE, COMPLIANCE_GRAPH_SCOPES, pkcePair, authorizeUrl, tokenRequestBody, refreshRequestBody, tokenEndpoint,
} from '../lib/authflow.js';
import { demoSnapshot, demoMailbox, demoRecipient, DEMO_ORG, DEMO_MAILBOXES, DEMO_RECIPIENTS } from '../lib/demo.js';
import { recipientType } from '../lib/recipient-types.js';
import { SAMPLES } from '../lib/samples.js';
import { analyze } from '../lib/analyzer.js';
import { buildMailboxView } from '../lib/mailbox.js';
import { notAuthorized } from '../lib/permissions.js';
import { lookupSignInError } from '../lib/content.js';
import { loadCompliance } from './compliance.mjs';
import { delegatedReady } from '../lib/tokenclaims.js';
import { callbackLocation, safeChain, safePage } from '../lib/hops.js';
import { connectSilently } from '../lib/connect-all.js';
import { aadstsOf, clip } from '../lib/logsafe.js';
import { logLine, logTokenError } from './log.mjs';
import { checkDomain } from './dns.mjs';
import { gatherSetupFacts } from './setup.mjs';
import { evaluateSetup, setupRecord } from '../lib/setup.js';
import { buildReport } from './report.mjs';
import { reportPdf, reportFileName } from '../lib/report-pdf.js';
import { deflateSync } from 'node:zlib';
import { settingsFrom, demoOrgBundle } from '../lib/org-settings.js';
import { shapeRecipients, demoRecipientsBundle } from '../lib/recipients.js';
import { demoTrace, normalizeTraceArgs, traceCommand, hasTraceFilter, signedOutTrace } from '../lib/trace.js';
import { demoQuarantine } from '../lib/quarantine.js';
import { runExo } from './exo.mjs';
import { startLive, liveStatus, forgetLive } from './nexthop-live.mjs';
import { listSnapshots, readSnapshot, startSnapshot, snapshotStatus, forgetSnapshot, saveSnapshot, snapshotStoreSettings, snapshotStoreClient, snapshotStoreSaver } from './snapshots.mjs';
import { diffSnapshots } from '../lib/snapshot-diff.js';
import { ALL_CHANGE_CHECKS } from '../lib/change-rights.js';
import { reportMhtml, reportMhtmlFileName } from '../lib/report-mhtml.js';
import { graphGet, graphList } from './graph.mjs';
import { EXTRA_KINDS, demoExtra, deviceRows, folderRows, auditRows, directoryRows, licenseRows, AUDIT_DAYS } from '../lib/recipient-extra.js';
import { handleRpc, NotSignedIn } from '../lib/mcp.js';
import {
  loadLicenses, loadDomains, searchRecipients, loadExchangeOrg, shapeExchange,
  loadMailboxLive, loadSignIns, loadMessageHeaders,
} from './live.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
const libDir = path.join(root, 'lib');
const PORT = Number(process.env.PORT || 8360);
const HOST = process.env.HOST || '127.0.0.1';
const TENANT = process.env.ENTRA_TENANT_ID || '';
const CLIENT = process.env.ENTRA_CLIENT_ID || '';
const ORG = process.env.ENTRA_ORGANIZATION || '';
// How many sections the mail flow export reads, for the NextHop live read's progress bar.
const EXPORT_SECTIONS = (() => {
  try { return (readFileSync(new URL('../export/Export-MailFlowConfig.ps1', import.meta.url), 'utf8').match(/^\s*@\{ name = '/gm) || []).length; } catch { return 0; }
})();
const REDIRECT = process.env.ENTRA_REDIRECT_URI || `http://localhost:${PORT}/auth/callback`;
const GRAPH_SCOPES = (process.env.GRAPH_SCOPES || DEFAULT_GRAPH_SCOPES.join(' ')).split(/[\s,]+/).filter(Boolean);
const EXO = process.env.EXO_SCOPE || EXO_SCOPE;
const PURVIEW_SCOPES = [...new Set([...GRAPH_SCOPES, ...COMPLIANCE_GRAPH_SCOPES])];
// Renew a token this long before it expires, so a page never starts a call with a dying token.
const RENEW_BEFORE_MS = 5 * 60 * 1000;
// How often to ask Entra again for an Exchange token that failed (for example before consent).
const EXO_RETRY_MS = 30 * 1000;

// MCP server (docs/mcp.md). A random key made at start, written to a file only the container user can read.
// server/mcp-stdio.mjs (run with docker exec) reads it, so only someone who can already run commands in the
// container can call /mcp. AI tools use the most recent browser sign-in; there is no second sign-in path.
const MCP_TOKEN = randomBytes(32).toString('base64url');
const MCP_TOKEN_FILE = process.env.EX360_MCP_TOKEN_FILE || path.join(os.tmpdir(), 'ex360-mcp.token');
const EXPORTS_DIR = process.env.EX360_EXPORTS_DIR || '/exports';
try { writeFileSync(MCP_TOKEN_FILE, MCP_TOKEN, { mode: 0o600 }); chmodSync(MCP_TOKEN_FILE, 0o600); } catch (error) { console.error(`MCP key file not written (${error.message}); AI tools are off.`); }

const sessions = new Map();
const pending = new Map();
const outlookReports = [];
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.ps1': 'text/plain; charset=utf-8', '.json': 'application/json' };

function send(res, status, body, headers = {}) {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  res.writeHead(status, { 'content-type': typeof body === 'string' || Buffer.isBuffer(body) ? (headers['content-type'] || 'text/plain; charset=utf-8') : 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'content-security-policy': "default-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'", ...headers, 'content-length': payload.length });
  res.end(payload);
}
function json(res, status, body) { send(res, status, body); }
function cookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function sessionOf(req) {
  const session = sessions.get(cookies(req).ex360sid) || null;
  if (session) session.seenAt = Date.now();
  return session;
}
// The browser sign-in AI tools act as: the most recently used one with a Graph token.
function mcpSession() {
  let best = null;
  for (const s of sessions.values()) if (s.graph?.access_token && (!best || (s.seenAt || 0) > (best.seenAt || 0))) best = s;
  return best;
}
function mcpDeps() {
  const demo = process.env.EX360_DEMO === '1';
  return {
    async api(pathname, params = {}, { signIn = true } = {}) {
      const session = mcpSession();
      if (signIn && !session && !demo) throw new NotSignedIn();
      const target = new URL(pathname, `http://127.0.0.1:${PORT}`);
      for (const [k, v] of Object.entries(params)) if (v !== '' && v != null) target.searchParams.set(k, v);
      const seen = session?.seenAt;
      const res = await fetch(target, { headers: session ? { cookie: `ex360sid=${encodeURIComponent(session.sid)}` } : {} });
      // A tool call is not the person using the browser; keep "most recent" meaning the browser.
      if (session) session.seenAt = seen;
      const text = await res.text();
      try { return JSON.parse(text); } catch { return { ok: res.ok, status: res.status, message: text.slice(0, 2000) }; }
    },
    exports: {
      folder: EXPORTS_DIR,
      async list() {
        let names;
        try { names = await readdir(EXPORTS_DIR); } catch { return []; }
        const rows = [];
        for (const name of names.filter(n => /\.json$/i.test(n))) {
          const st = await stat(path.join(EXPORTS_DIR, name)).catch(() => null);
          if (st?.isFile()) rows.push({ name, sizeBytes: st.size, modified: st.mtime.toISOString() });
        }
        return rows.sort((a, b) => b.modified.localeCompare(a.modified));
      },
      async read(name) {
        const file = safeFile(EXPORTS_DIR, name);
        if (!file) throw Object.assign(new Error('not found'), { code: 'ENOENT' });
        const st = await stat(file);
        if (st.size > 50 * 1024 * 1024) throw new Error('the file is larger than 50 MB');
        return readFile(file, 'utf8');
      },
    },
  };
}
function mcpAllowed(req) {
  const auth = String(req.headers.authorization || '');
  const given = Buffer.from(auth.startsWith('Bearer ') ? auth.slice(7) : '');
  const want = Buffer.from(MCP_TOKEN);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return false;
  // DNS rebinding guard: a browser page on another site never gets here with a localhost Origin.
  const origin = req.headers.origin;
  return !origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
}
function staleCookie(req) { const sid = cookies(req).ex360sid; return Boolean(sid) && !sessions.has(sid); }

function stamp(token) {
  if (token && !token.expires_at) token.expires_at = Date.now() + (Number(token.expires_in) || 3600) * 1000;
  return token;
}
const SCOPE_FOR = {
  graph: session => (session.purview ? PURVIEW_SCOPES : GRAPH_SCOPES).join(' '),
  exo: () => `offline_access ${EXO}`,
  compliance: () => `offline_access ${IPPS_SCOPE}`,
};
async function renew(session, kind, refreshToken) {
  const next = stamp(await tokenPost(refreshRequestBody({ clientId: CLIENT, refreshToken, scope: SCOPE_FOR[kind](session) }), kind === 'exo' ? 'exchange' : kind));
  if (!next.refresh_token) next.refresh_token = refreshToken;
  session[kind] = next;
  return next;
}
// Keep every token in the session fresh. Access tokens last about an hour; without this every page
// says Not authorized after an hour even though nothing about permissions changed.
async function refreshSession(session, { forceExo = false } = {}) {
  if (!session?.graph) return;
  if (session.refreshing) return session.refreshing;
  session.refreshing = (async () => {
    for (const kind of ['graph', 'exo', 'compliance']) {
      const token = stamp(session[kind]);
      if (!token?.access_token || token.expires_at - Date.now() > RENEW_BEFORE_MS) continue;
      const rt = token.refresh_token || session.graph?.refresh_token;
      if (!rt) continue;
      try {
        await renew(session, kind, rt);
        if (session.refreshError?.kind === kind) session.refreshError = null;
      } catch (error) {
        session.refreshError = { kind: kind === 'exo' ? 'Exchange' : kind === 'graph' ? 'Graph' : 'compliance', message: clip(error.message) };
      }
    }
    // No Exchange token yet (often: consent was granted after sign-in). Ask again from the Graph sign-in.
    const exoReady = delegatedReady(session.exo?.access_token, 'exchange');
    if (!exoReady && session.graph?.refresh_token && (forceExo || Date.now() - (session.exoTriedAt || 0) > EXO_RETRY_MS)) {
      session.exoTriedAt = Date.now();
      try {
        await renew(session, 'exo', session.graph.refresh_token);
        session.exoError = delegatedReady(session.exo?.access_token, 'exchange') ? null : session.exoError;
      } catch (error) {
        session.exoError = exoFailure(error);
      }
    }
  })().finally(() => { session.refreshing = null; });
  return session.refreshing;
}
// Scopes for each connection when it is redeemed from the Graph refresh token without a prompt.
const SILENT_SCOPE = {
  exchange: () => `offline_access ${EXO}`,
  purview: () => PURVIEW_SCOPES.join(' '),
  compliance: () => `offline_access ${IPPS_SCOPE}`,
};
// After the Graph sign-in, get Exchange, Purview Graph and compliance PowerShell from the same
// refresh token. Returns the connections that still need an interactive hop.
async function connectRest(session) {
  const result = await connectSilently({
    session,
    redeem: async (id, refreshToken) => stamp(await tokenPost(refreshRequestBody({ clientId: CLIENT, refreshToken, scope: SILENT_SCOPE[id]() }), id)),
  });
  if (result.errors.exchange) { session.exoTriedAt = Date.now(); session.exoError = exoFailure(result.errors.exchange); }
  logLine('auth.silent', {
    connected: result.connected.join(','),
    missing: result.missing.join(','),
    failed: Object.entries(result.errors).map(([id, e]) => `${id}:${aadstsOf(e.message) || 'error'}`).join(','),
  });
  return result.missing;
}
// Config snapshots stored in a snapshot store: the person's own access token for the store's API (SNAPSHOT_STORE_API_SCOPE), redeemed without a
// prompt from the Graph sign-in's refresh token, like Exchange and compliance. Kept in the session until it expires.
const STORE = snapshotStoreSettings();
async function snapshotStoreToken(session) {
  const t = stamp(session?.snapshotStore);
  if (t?.access_token && t.expires_at - Date.now() > RENEW_BEFORE_MS) return t.access_token;
  if (!session?.graph?.refresh_token) throw new Error('Sign in to Exchange 360 first.');
  try {
    session.snapshotStore = stamp(await tokenPost(refreshRequestBody({ clientId: CLIENT, refreshToken: session.graph.refresh_token, scope: STORE.scope }), 'snapshotStore'));
  } catch (error) {
    throw new Error(/65001|consent/i.test(error.message)
      ? `Admin consent for the snapshot store (${STORE.scope}) is missing on the Exchange 360 app registration. Grant it in the Microsoft Entra admin center.`
      : `Exchange 360 could not get a token for the snapshot store: ${clip(error.message, 300)}`);
  }
  return session.snapshotStore.access_token;
}
function snapshotStoreFor(session) {
  return STORE.configured && session?.graph ? snapshotStoreClient({ settings: STORE, token: () => snapshotStoreToken(session) }) : null;
}

function exoFailure(error) {
  return /consent|65001|70011/i.test(error.message) && !lookupSignInError(error.message)
    ? { ...notAuthorized('exchange', 'Admin consent for Exchange.Manage is missing. Setup steps shows how to grant it.'), detail: clip(error.message) }
    : { ok: false, message: signInFailure(error.message), detail: clip(error.message) };
}
function wantsDemo(url, session) {
  if (url.searchParams.get('demo') === '1' || process.env.EX360_DEMO === '1') return true;
  return !session;
}

async function tokenPost(body, resource) {
  const res = await fetch(tokenEndpoint(TENANT), { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const description = payload.error_description || payload.error || `Token endpoint returned ${res.status}`;
    logTokenError(resource, description);
    const err = new Error(description);
    err.code = payload.error || '';
    throw err;
  }
  return payload;
}

async function readBody(req, limit = 200000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('The report is larger than 200 KB.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function safeFile(dir, urlPath) {
  const rel = decodeURIComponent(urlPath.split('?')[0]).replace(/^\/+/, '');
  if (!rel || rel.includes('\0')) return null;
  const file = path.normalize(path.join(dir, rel));
  if (file !== dir && !file.startsWith(dir + path.sep)) return null;
  return file;
}

async function ensureUpn(session) {
  if (!session) return '';
  if (session.account?.username) return session.account.username;
  if (!session.graph?.access_token) return '';
  const { graphGet } = await import('./graph.mjs');
  const me = await graphGet(session.graph.access_token, '/me?$select=userPrincipalName', 'users');
  const upn = me.ok ? (me.json?.userPrincipalName || '') : '';
  if (upn) session.account = { ...(session.account || {}), username: upn };
  return upn;
}

function exoIdentity(session, upn) {
  return { userPrincipalName: upn || session?.account?.username || '', clientId: CLIENT };
}

async function fetchHealth(session) {
  const { graphList } = await import('./graph.mjs');
  return graphList(session.graph.access_token, '/admin/serviceAnnouncement/healthOverviews', 'health');
}
async function fetchIssues(session) {
  const { graphList } = await import('./graph.mjs');
  return graphList(session.graph.access_token, '/admin/serviceAnnouncement/issues?$top=15', 'messages');
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (req.method === 'POST' && url.pathname === '/api/outlook-client') {
      const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
      const report = { receivedAt: new Date().toISOString(), computer: String(body.computer || ''), outlook: body.outlook || {}, profiles: body.profiles || [], addins: body.addins || [], autodiscover: body.autodiscover || {}, connectivity: body.connectivity || [] };
      outlookReports.unshift(report);
      outlookReports.splice(20);
      return json(res, 200, { ok: true });
    }
    if (url.pathname === '/mcp') {
      // Model Context Protocol, Streamable HTTP with plain JSON answers. Every tool only reads (lib/mcp.js).
      if (!mcpAllowed(req)) return json(res, 401, { jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Exchange 360 MCP: missing or wrong key. Connect with server/mcp-stdio.mjs (docs/mcp.md).' } });
      if (req.method === 'GET') return send(res, 405, 'Exchange 360 MCP answers POST only; it does not stream.', { allow: 'POST' });
      if (req.method === 'DELETE') return send(res, 200, '');
      if (req.method !== 'POST') return send(res, 405, 'POST only.', { allow: 'POST' });
      let msg;
      try { msg = JSON.parse((await readBody(req, 1_000_000)).toString('utf8')); } catch { return json(res, 400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); }
      const deps = mcpDeps();
      const out = Array.isArray(msg) ? (await Promise.all(msg.map(m => handleRpc(m, deps)))).filter(Boolean) : await handleRpc(msg, deps);
      if (!out || (Array.isArray(out) && !out.length)) return send(res, 202, '');
      if (!Array.isArray(msg) && msg.method === 'tools/call') logLine('mcp.call', { tool: String(msg.params?.name || '').slice(0, 60), error: Boolean(out.result?.isError) });
      return json(res, 200, out);
    }
    const snapshotPost = req.method === 'POST' && url.pathname === '/api/snapshots/start';
    if (req.method !== 'GET' && req.method !== 'HEAD' && !snapshotPost) return send(res, 405, 'Ex360 v1 does not change the tenant. This method is not used.');

    if (url.pathname === '/healthz') return json(res, 200, { ok: true, name: 'exchange-360' });

    if (url.pathname === '/auth/login') {
      if (!TENANT || !CLIENT) return send(res, 500, 'Set ENTRA_TENANT_ID and ENTRA_CLIENT_ID in .env. See .env.example.');
      const asked = url.searchParams.get('resource');
      const resource = asked === 'exchange' ? 'exchange' : asked === 'compliance' ? 'compliance' : asked === 'purview' ? 'purview' : 'graph';
      const returnTo = safePage(url.searchParams.get('return'));
      const next = safeChain(url.searchParams.get('next'));
      const { verifier, challenge } = pkcePair();
      const state = randomBytes(16).toString('base64url');
      pending.set(state, { verifier, resource, returnTo, next, at: Date.now() });
      logLine('auth.hop', { resource, return: returnTo, next: next.join(',') });
      const scopes = resource === 'exchange' ? ['openid', 'offline_access', EXO]
        : resource === 'compliance' ? ['openid', 'offline_access', IPPS_SCOPE]
        : resource === 'purview' ? [...new Set([...GRAPH_SCOPES, ...COMPLIANCE_GRAPH_SCOPES])]
        : GRAPH_SCOPES;
      const session = sessionOf(req);
      const location = authorizeUrl({
        tenant: TENANT, clientId: CLIENT, redirectUri: REDIRECT, scopes, challenge, state,
        // Only force the consent screen when asked. Entra shows it by itself when consent is missing,
        // and forcing it blocks non-admins in tenants where user consent is turned off.
        prompt: url.searchParams.get('consent') === '1' ? 'consent' : resource === 'graph' ? 'select_account' : undefined,
        loginHint: session?.account?.username,
      });
      return send(res, 302, '', { location });
    }

    if (url.pathname === '/auth/callback') {
      const err = url.searchParams.get('error_description') || url.searchParams.get('error');
      if (err) {
        logLine('auth.callback', { ok: false, aadsts: aadstsOf(err), error: clip(err) });
        return send(res, 400, signInFailure(err));
      }
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const flow = pending.get(state);
      pending.delete(state);
      if (!flow || !code) {
        logLine('auth.callback', { ok: false, error: 'expired' });
        return send(res, 400, 'This sign-in has expired. Start again from the app.');
      }
      const scopes = flow.resource === 'exchange' ? `openid offline_access ${EXO}`
        : flow.resource === 'compliance' ? `openid offline_access ${IPPS_SCOPE}`
        : flow.resource === 'purview' ? [...new Set([...GRAPH_SCOPES, ...COMPLIANCE_GRAPH_SCOPES])].join(' ')
        : GRAPH_SCOPES.join(' ');
      let token;
      try {
        token = await tokenPost(tokenRequestBody({ clientId: CLIENT, redirectUri: REDIRECT, code, verifier: flow.verifier, scope: scopes }), flow.resource);
      } catch (error) {
        logLine('auth.callback', { resource: flow.resource, ok: false, aadsts: aadstsOf(error.message), error: clip(error.message) });
        return send(res, 400, signInFailure(error.message));
      }
      let session = sessionOf(req);
      if (!session) {
        const sid = randomBytes(24).toString('base64url');
        session = { sid, graph: null, exo: null, compliance: null, purview: false, account: {} };
        sessions.set(sid, session);
        res.setHeader('set-cookie', `ex360sid=${encodeURIComponent(sid)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200`);
      }
      stamp(token);
      const account = accountFromToken(token.access_token);
      if (flow.resource === 'graph' || !session.account?.username) session.account = account;
      if (flow.resource === 'exchange') { session.exo = token; session.exoError = null; }
      else if (flow.resource === 'compliance') session.compliance = token;
      else if (flow.resource === 'purview') {
        session.graph = token;
        session.purview = true;
      } else {
        session.graph = token;
        session.purview = false;
        session.refreshError = null;
        session.exoTriedAt = 0;
        session.exo = null;
        session.compliance = null;
        // One click signs in to everything: the rest come from the same refresh token without a prompt.
        // Anything that still fails goes in front of the chain, so the browser carries straight on to it.
        const missing = await connectRest(session);
        flow.next = safeChain([...missing, ...(flow.next || [])]);
      }
      logLine('auth.callback', { resource: flow.resource, ok: true, return: flow.returnTo || '' });
      return send(res, 302, '', { location: callbackLocation(flow) });
    }

    if (url.pathname === '/auth/connect-all') {
      // Connect everything: try every missing connection silently first, then hop only for what is left.
      const returnTo = safePage(url.searchParams.get('return'));
      const current = sessionOf(req);
      if (!current?.graph?.refresh_token) return send(res, 302, '', { location: `/auth/login${returnTo ? `?return=${returnTo}` : ''}` });
      const missing = await connectRest(current);
      return send(res, 302, '', { location: callbackLocation({ returnTo, next: missing }) });
    }

    if (url.pathname === '/auth/logout') {
      const sid = cookies(req).ex360sid;
      sessions.delete(sid);
      forgetLive(sid);
      forgetSnapshot(sid);
      res.setHeader('set-cookie', 'ex360sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
      return send(res, 302, '', { location: '/#start' });
    }

    const session = sessionOf(req);
    if (session && url.pathname.startsWith('/api/')) await refreshSession(session);
    if (url.pathname === '/api/setup') {
      const env = { tenantId: TENANT, clientId: CLIENT, objectId: process.env.ENTRA_OBJECT_ID || '', organization: ORG, redirectUri: REDIRECT, exoScope: EXO };
      let exoLive = null;
      if (url.searchParams.get('live') === '1' && session?.graph) {
        await refreshSession(session, { forceExo: true });
        const { runExo } = await import('./exo.mjs');
        exoLive = session.exo?.access_token
          ? await runExo({ token: session.exo.access_token, organization: ORG, mode: 'ping', timeoutMs: 90000, ...exoIdentity(session, await ensureUpn(session)) })
          : { ok: false, message: 'There is no Exchange Online token to connect with. See the Exchange token row.' };
        if (exoLive && exoLive.ok) {
          const info = (exoLive.commands || []).find(c => c.name === 'org')?.value?.[0] || {};
          const who = (exoLive.commands || []).find(c => c.name === 'connection')?.value?.[0] || {};
          exoLive = { ok: true, organization: info.Name || info.DisplayName || '', user: who.UserPrincipalName || '' };
        }
      }
      const facts = await gatherSetupFacts({
        env, graphScopes: GRAPH_SCOPES, browserHost: req.headers.host || '', session,
        staleCookie: staleCookie(req), outlookReports: outlookReports.length, exoLive,
      });
      return json(res, 200, { ...evaluateSetup(facts), record: setupRecord(env, GRAPH_SCOPES) });
    }
    if (url.pathname === '/api/session') {
      return json(res, 200, {
        signedIn: Boolean(session?.graph),
        // Demo data is for the automated tests and local development only (EX360_DEMO=1). The app has no demo switch.
        demo: process.env.EX360_DEMO === '1',
        account: session?.account || null,
        exchange: delegatedReady(session?.exo?.access_token, 'exchange'),
        purview: Boolean(session?.purview),
        compliance: delegatedReady(session?.compliance?.access_token, 'compliance'),
        connections: {
          graph: Boolean(session?.graph?.access_token),
          exchange: delegatedReady(session?.exo?.access_token, 'exchange'),
          purview: Boolean(session?.purview),
          compliance: delegatedReady(session?.compliance?.access_token, 'compliance'),
        },
        exchangeError: session?.exoError || null,
        refreshError: session?.refreshError || null,
        staleCookie: staleCookie(req),
        configured: Boolean(TENANT && CLIENT),
        consent: 'Not signed in. Setup steps checks whether admin consent and everything else Ex360 needs is in place.',
        organization: ORG || null,
      });
    }
    if (url.pathname === '/api/demo') return json(res, 200, { ...demoSnapshot(), outlook: DEMO_ORG.outlook, org: DEMO_ORG });
    if (url.pathname === '/api/sample') {
      const sample = SAMPLES[url.searchParams.get('id') || 'spoof'] || SAMPLES.spoof;
      return json(res, 200, { ...sample, analysis: analyze(sample.headers) });
    }
    if (url.pathname === '/api/dns') {
      const domain = url.searchParams.get('domain') || '';
      return json(res, 200, await checkDomain(domain));
    }
    if (url.pathname === '/api/outlook-client') {
      if (wantsDemo(url, session)) return json(res, 200, { source: 'demo', report: DEMO_ORG.outlook });
      return json(res, 200, { source: 'live', report: outlookReports[0] || null });
    }

    // NextHop live read (Troubleshoot > NextHop): reads the mail flow configuration from the live tenant with the
    // signed-in person's own tokens. start=1 starts it (a read, like every other page); otherwise the status, and
    // config=1 adds the configuration once it is done. One job per session, kept in memory only.
    if (url.pathname === '/api/nexthop/live') {
      if (!session?.sid) return json(res, 200, { state: 'none', signedIn: false });
      if (url.searchParams.get('start') === '1') {
        const mailbox = String(url.searchParams.get('mailbox') || '').trim();
        if (mailbox && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mailbox)) return json(res, 200, { state: 'error', message: 'The mailbox must be an email address.' });
        return json(res, 200, startLive(session.sid, { exoToken: session.exo?.access_token, ippsToken: session.compliance?.access_token, upn: await ensureUpn(session), mailbox, total: EXPORT_SECTIONS }));
      }
      return json(res, 200, { ...liveStatus(session.sid, { withConfig: url.searchParams.get('config') === '1' }), signedIn: true, exchange: Boolean(session.exo?.access_token), compliance: Boolean(session.compliance?.access_token), upn: session.account?.username || '' });
    }

    // Config snapshots (Organization > Auditing/Logging > Config snapshots): one click reads the mail flow configuration
    // (read-only) and stores it in the snapshot store when SNAPSHOT_STORE_URL and SNAPSHOT_STORE_API_SCOPE are set, otherwise in the snapshots folder on the PC.
    // Starting one is a POST with a JSON body (the session cookie is SameSite=Lax, so other sites cannot start one).
    if (snapshotPost) {
      if (!String(req.headers['content-type'] || '').startsWith('application/json')) return json(res, 415, { state: 'error', message: 'Send JSON.' });
      if (!session?.sid) return json(res, 200, { state: 'error', message: 'Sign in first: a snapshot reads the tenant with your own sign-in.' });
      let body = {};
      try { body = JSON.parse((await readBody(req, 10000)).toString('utf8') || '{}'); } catch { return json(res, 400, { state: 'error', message: 'The request was not valid JSON.' }); }
      const snapshotStore = snapshotStoreFor(session);
      if (STORE.configured && !snapshotStore) return json(res, 200, { state: 'error', message: 'Sign in first: the snapshot store saves the snapshot with your own sign-in.' });
      return json(res, 200, startSnapshot(session.sid, { exoToken: session.exo?.access_token, ippsToken: session.compliance?.access_token, upn: await ensureUpn(session), label: String(body.label || ''), total: EXPORT_SECTIONS, save: snapshotStore ? snapshotStoreSaver(snapshotStore) : saveSnapshot }));
    }
    if (url.pathname === '/api/snapshots') {
      const snapshotStore = snapshotStoreFor(session);
      return json(res, 200, { ...(await listSnapshots({ snapshotStore })), snapshotStore: { configured: STORE.configured, url: STORE.url, problem: STORE.problem, needsSignIn: STORE.configured && !snapshotStore }, job: session?.sid ? snapshotStatus(session.sid) : { state: 'none' }, signedIn: Boolean(session?.sid), exchange: Boolean(session?.exo?.access_token), compliance: Boolean(session?.compliance?.access_token) });
    }
    if (url.pathname === '/api/snapshots/file') {
      const got = await readSnapshot(url.searchParams.get('id'), { snapshotStore: snapshotStoreFor(session) });
      if (!got.ok) return json(res, 404, got);
      return send(res, 200, JSON.stringify(got.cfg, null, 2), { 'content-type': 'application/json; charset=utf-8', 'content-disposition': `attachment; filename="${got.name}"` });
    }
    if (url.pathname === '/api/snapshots/diff') {
      const a = await readSnapshot(url.searchParams.get('a'), { snapshotStore: snapshotStoreFor(session) });
      if (!a.ok) return json(res, 200, a);
      const b = await readSnapshot(url.searchParams.get('b'), { snapshotStore: snapshotStoreFor(session) });
      if (!b.ok) return json(res, 200, b);
      return json(res, 200, { ...diffSnapshots(a.cfg, b.cfg), beforeName: a.name, afterName: b.name });
    }

    if (url.pathname === '/api/compliance') {
      return json(res, 200, await loadCompliance({
        demo: wantsDemo(url, session),
        graphToken: session?.graph?.access_token,
        exoToken: session?.exo?.access_token,
        ippsToken: session?.compliance?.access_token,
        organization: ORG,
        user: url.searchParams.get('user') || '',
        operation: url.searchParams.get('operation') || '',
        ...exoIdentity(session, await ensureUpn(session)),
      }));
    }

    if (url.pathname === '/api/org') {
      if (wantsDemo(url, session)) {
        const demoSettings = settingsFrom(demoOrgBundle());
        return json(res, 200, { source: 'demo', ...DEMO_ORG, settings: demoSettings.settings, settingsErrors: demoSettings.errors });
      }
      const identity = exoIdentity(session, await ensureUpn(session));
      const [licenses, domains, health, issues, exoRaw] = await Promise.all([
        loadLicenses(session.graph.access_token),
        loadDomains(session.graph.access_token),
        fetchHealth(session),
        fetchIssues(session),
        loadExchangeOrg(session.exo?.access_token, ORG, identity),
      ]);
      const exchange = shapeExchange(exoRaw);
      const full = settingsFrom(exoRaw);
      return json(res, 200, {
        settings: full.settings,
        settingsErrors: full.errors,
        source: 'live',
        tenant: session.account?.tenant || '',
        defender: exchange.defender !== false,
        skus: licenses.ok ? licenses.skus : licenses,
        domains: domains.ok ? domains.domains : domains,
        remoteDomains: exchange.remote,
        connectors: exchange.connectors,
        transportRules: exchange.transportRules,
        presets: [],
        antiSpam: exchange.antiSpam,
        antiPhish: exchange.antiPhish,
        safeLinks: exchange.safeLinks,
        safeAttachments: exchange.safeAttachments,
        quarantine: exchange.quarantine,
        config: exchange.config,
        health: health.ok ? { authorized: true, services: health.value, issues: issues.ok ? issues.value : [] } : health,
        exchangeError: exoRaw.ok ? null : exoRaw,
      });
    }

    if (url.pathname === '/api/mailboxes') {
      // Single recipient search: every recipient that can receive email, not only user mailboxes.
      if (wantsDemo(url, session)) {
        const q = (url.searchParams.get('q') || '').toLowerCase();
        const rows = [...DEMO_MAILBOXES, ...DEMO_RECIPIENTS].filter(m => !q || `${m.displayName} ${m.primary}`.toLowerCase().includes(q));
        return json(res, 200, { source: 'demo', value: rows.map(m => ({ id: m.id, source: 'demo', displayName: m.displayName, primary: m.primary, type: m.type, typeLabel: recipientType(m.type).label })) });
      }
      // Exchange Online adds dynamic distribution lists, room lists and mail-enabled public folders, which Graph does not list.
      const upn = await ensureUpn(session);
      const exchange = session.exo?.access_token ? q => runExo({ token: session.exo.access_token, organization: ORG, mode: 'search', args: { q }, ...exoIdentity(session, upn), timeoutMs: 60000 }) : null;
      const found = await searchRecipients(session.graph.access_token, url.searchParams.get('q') || '', exchange);
      if (!found.ok) return json(res, 200, found);
      return json(res, 200, { source: 'live', value: found.value, skipped: found.skipped });
    }

    if (url.pathname === '/api/mailbox') {
      const id = url.searchParams.get('id') || '';
      if (wantsDemo(url, session)) {
        const mailbox = demoRecipient(id);
        if (!mailbox) return json(res, 200, { ok: false, message: 'No Contoso recipient matches that name.' });
        return json(res, 200, { source: 'demo', view: buildMailboxView(DEMO_ORG, mailbox) });
      }
      const source = ['user', 'group', 'contact', 'exo'].includes(url.searchParams.get('source')) ? url.searchParams.get('source') : 'user';
      const live = await loadMailboxLive(session.graph.access_token, session.exo?.access_token, ORG, id, exoIdentity(session, await ensureUpn(session)), source);
      if (!live.ok) return json(res, 200, live);
      const org = { transportRules: [], connectors: [], presets: [], antiSpam: [], antiPhish: [], safeLinks: [], safeAttachments: [], quarantine: [], defender: true, skus: [] };
      return json(res, 200, { source: 'live', view: buildMailboxView(org, live.mailbox), exchange: live.mailbox.exchange });
    }

    if (url.pathname === '/api/report' || url.pathname === '/api/report.pdf' || url.pathname === '/api/report.mhtml') {
      const id = (url.searchParams.get('id') || '').slice(0, 200);
      if (!id) return json(res, 400, { ok: false, message: 'Pick a mailbox first.' });
      const report = await buildReport({
        session, id, demo: wantsDemo(url, session), organization: ORG,
        identity: exoIdentity(session, await ensureUpn(session)),
        timeZone: url.searchParams.get('tz') || '', fresh: url.searchParams.get('fresh') === '1',
      });
      if (url.pathname === '/api/report') return json(res, 200, report.sections ? { ok: true, report } : report);
      if (!report.sections) return send(res, 400, report.message || 'The report could not be built.');
      if (url.pathname === '/api/report.mhtml') {
        // The same report as one self-contained web archive. Built in memory and streamed; never written to disk.
        return send(res, 200, reportMhtml(report), {
          'content-type': 'multipart/related; type="text/html"',
          'content-disposition': `attachment; filename="${reportMhtmlFileName(report)}"`,
        });
      }
      // Built in memory and streamed to the browser. Ex360 never writes the PDF to disk.
      return send(res, 200, reportPdf(report, { compress: deflateSync }), {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="${reportFileName(report)}"`,
      });
    }

    if (url.pathname === '/api/rights') {
      // Single recipient: does your Exchange role include the change each page links to? Read once per sign-in.
      if (wantsDemo(url, session)) return json(res, 200, { source: 'demo', value: ALL_CHANGE_CHECKS.map(c => ({ cmdlet: c.cmdlet, available: true, missing: [] })) });
      if (!session.exo?.access_token) return json(res, 200, { ok: false, ...notAuthorized('exchange') });
      if (!session.rights || Date.now() - session.rights.at > 15 * 60 * 1000) {
        const exo = await runExo({ token: session.exo.access_token, organization: ORG, mode: 'rights', args: { checks: ALL_CHANGE_CHECKS }, ...exoIdentity(session, await ensureUpn(session)), timeoutMs: 90000 });
        const rows = exo?.ok ? (exo.commands || []).find(c => c.name === 'rights') : null;
        if (!rows?.ok) return json(res, 200, { ok: false, label: 'Could not check your role', message: exo?.message || 'Exchange Online PowerShell did not answer.', authorized: true });
        session.rights = { at: Date.now(), value: rows.value || [] };
      }
      return json(res, 200, { source: 'live', value: session.rights.value });
    }

    if (url.pathname === '/api/signins') {
      if (wantsDemo(url, session)) {
        const mailbox = demoRecipient(url.searchParams.get('id') || '');
        return json(res, 200, { source: 'demo', value: mailbox?.signIns || [] });
      }
      const upn = url.searchParams.get('upn') || '';
      const rows = await loadSignIns(session.graph.access_token, { id: url.searchParams.get('id') || '', upn });
      return json(res, 200, rows.ok ? { source: 'live', value: rows.value } : rows);
    }

    if (url.pathname === '/api/trace') {
      const traceArgs = normalizeTraceArgs(name => url.searchParams.get(name));
      const query = { ...traceArgs, command: traceCommand(traceArgs) };
      if (!hasTraceFilter(traceArgs)) return json(res, 200, { ok: false, label: 'Search', authorized: true, message: 'Enter a sender, a recipient, a message ID or a subject.', query });
      // A trace for a real message must never be answered from the Contoso sample just because the
      // sign-in is missing (Ex360 restarted, another browser): say so instead of returning empty demo rows.
      if (!session && url.searchParams.get('demo') !== '1' && process.env.EX360_DEMO !== '1') return json(res, 200, { ...signedOutTrace(), query });
      if (wantsDemo(url, session)) return json(res, 200, { ...demoTrace(traceArgs), query });
      if (!session.exo?.access_token) return json(res, 200, { ...notAuthorized('trace'), query });
      const upn = await ensureUpn(session);
      const result = await runExo({ token: session.exo.access_token, organization: ORG, mode: 'trace', ...exoIdentity(session, upn), args: traceArgs });
      return json(res, 200, { source: 'live', ...result, query: { ...query, account: upn || '' } });
    }

    if (url.pathname === '/api/quarantine') {
      const qArgs = {
        recipient: (url.searchParams.get('recipient') || '').slice(0, 320),
        sender: (url.searchParams.get('sender') || '').slice(0, 320),
        days: Math.min(30, Math.max(1, Number(url.searchParams.get('days')) || 14)),
      };
      if (wantsDemo(url, session)) return json(res, 200, demoQuarantine(qArgs));
      if (!session.exo?.access_token) return json(res, 200, notAuthorized('exchange'));
      const result = await runExo({ token: session.exo.access_token, organization: ORG, mode: 'quarantine', ...exoIdentity(session, await ensureUpn(session)), args: qArgs });
      return json(res, 200, { source: 'live', ...result });
    }

    if (url.pathname === '/api/recipient-extra') {
      // Single recipient: Mobile devices, Calendar and folder permissions, Admin changes, Licenses and service plans.
      const what = url.searchParams.get('what') || '';
      const address = (url.searchParams.get('address') || '').slice(0, 320);
      const userId = (url.searchParams.get('id') || '').slice(0, 200);
      if (!EXTRA_KINDS.includes(what) || !address) return json(res, 400, { ok: false, message: 'Pick a recipient first.' });
      if (wantsDemo(url, session)) return json(res, 200, demoExtra(what, address));
      const exo = async () => {
        if (!session.exo?.access_token) return { ok: false, ...notAuthorized('exchange') };
        const raw = await runExo({ token: session.exo.access_token, organization: ORG, mode: 'recipientextra', args: { identity: address, what }, ...exoIdentity(session, await ensureUpn(session)), timeoutMs: 180000 });
        if (!raw?.ok) return { ok: false, authorized: true, label: 'Could not read', message: raw?.message || 'Exchange Online PowerShell did not answer.' };
        const cmd = (raw.commands || [])[0];
        if (!cmd?.ok) return { ok: false, authorized: !/not authorized|access denied|isn't recognized|is not recognized/i.test(cmd?.error || ''), label: /not authorized|access denied/i.test(cmd?.error || '') ? 'Not authorized' : 'Could not read', message: cmd?.error || 'The read failed.' };
        return { ok: true, value: cmd.value || [] };
      };
      const graphUser = encodeURIComponent(/^[0-9a-f-]{36}$/i.test(userId) ? userId : address);
      if (what === 'devices') { const r = await exo(); return json(res, 200, r.ok ? { ok: true, source: 'live', value: deviceRows(r.value) } : r); }
      if (what === 'folders') { const r = await exo(); return json(res, 200, r.ok ? { ok: true, source: 'live', value: folderRows(r.value) } : r); }
      if (what === 'audit') {
        const [ex, dir] = await Promise.all([
          exo(),
          /^[0-9a-f-]{36}$/i.test(userId) ? graphList(session.graph.access_token, `/auditLogs/directoryAudits?$filter=${encodeURIComponent(`targetResources/any(t:t/id eq '${userId}')`)}&$top=50`, 'directoryAudit', 2) : Promise.resolve({ ok: true, value: [] }),
        ]);
        return json(res, 200, { ok: true, source: 'live', days: AUDIT_DAYS, exchange: ex.ok ? { ok: true, value: auditRows(ex.value) } : ex, directory: dir.ok ? { ok: true, value: directoryRows(dir.value) } : dir });
      }
      // licenses
      const [details, user] = await Promise.all([
        graphList(session.graph.access_token, `/users/${graphUser}/licenseDetails`, 'users', 2),
        graphGet(session.graph.access_token, `/users/${graphUser}?$select=id,licenseAssignmentStates`, 'users'),
      ]);
      if (!details.ok) return json(res, 200, details);
      const states = user.ok ? user.json.licenseAssignmentStates || [] : [];
      const groupIds = [...new Set(states.map(s => s.assignedByGroup).filter(Boolean))].slice(0, 20);
      const names = {};
      await Promise.all(groupIds.map(async gid => { const g = await graphGet(session.graph.access_token, `/groups/${encodeURIComponent(gid)}?$select=displayName`, 'groups'); if (g.ok) names[gid] = g.json.displayName; }));
      return json(res, 200, { ok: true, source: 'live', value: licenseRows(details.value, states, names) });
    }

    if (url.pathname === '/api/recipients') {
      if (wantsDemo(url, session)) return json(res, 200, { source: 'demo', ...shapeRecipients(demoRecipientsBundle()) });
      if (!session.exo?.access_token) return json(res, 200, { source: 'live', ...shapeRecipients(notAuthorized('exchange')) });
      const raw = await runExo({ token: session.exo.access_token, organization: ORG, mode: 'recipients', ...exoIdentity(session, await ensureUpn(session)) });
      const shaped = shapeRecipients(raw);
      // Shared mailboxes: whether the user object can sign in directly. One Graph read each, capped at 50.
      await Promise.all(shaped.shared.slice(0, 50).map(async box => {
        if (!box.ExternalDirectoryObjectId) return;
        const u = await graphGet(session.graph.access_token, `/users/${encodeURIComponent(box.ExternalDirectoryObjectId)}?$select=accountEnabled`, 'users');
        if (u.ok) box.AccountEnabled = u.json.accountEnabled;
      }));
      return json(res, 200, { source: 'live', ...shaped });
    }

    if (url.pathname === '/api/headers') {
      if (wantsDemo(url, session)) return json(res, 200, { source: 'demo', headers: SAMPLES.spoof.headers });
      const result = await loadMessageHeaders(session.graph.access_token, url.searchParams.get('user') || '', url.searchParams.get('internetMessageId') || '');
      return json(res, 200, result);
    }

    if (url.pathname === '/' || url.pathname === '/index.html') {
      const file = path.join(publicDir, 'index.html');
      return send(res, 200, await readFile(file), { 'content-type': TYPES['.html'] });
    }
    const base = url.pathname.startsWith('/lib/') ? libDir : publicDir;
    const rel = url.pathname.startsWith('/lib/') ? url.pathname.slice('/lib/'.length) : url.pathname;
    const file = safeFile(base, rel);
    if (!file || !existsSync(file) || !statSync(file).isFile()) return send(res, 404, 'Not found');
    const type = TYPES[path.extname(file)] || 'application/octet-stream';
    if (req.method === 'HEAD') return send(res, 200, '', { 'content-type': type });
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    createReadStream(file).pipe(res);
    return;
  } catch (error) {
    logLine('request', { path: url.pathname, error: clip(error.message || '') });
    json(res, 500, { ok: false, message: error.message || 'The request failed.' });
  }
});

function signInFailure(text) {
  const hit = lookupSignInError(text);
  if (!hit) return `Sign-in was not completed. ${text}`;
  return `${hit.code}. ${hit.cause} ${hit.fix}`;
}

function accountFromToken(access) {
  try {
    const payload = JSON.parse(Buffer.from(access.split('.')[1], 'base64url').toString('utf8'));
    return { name: payload.name || '', username: payload.preferred_username || payload.upn || '', tenant: payload.tid || '' };
  } catch { return { name: '', username: '', tenant: '' }; }
}

server.listen(PORT, HOST, () => {
  console.log(`Exchange 360 listening on http://${HOST}:${PORT}`);
});
