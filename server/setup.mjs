// Gathers the facts the Setup steps page checks. Every call here is a read (GET to Microsoft,
// Get- cmdlets in PowerShell). Nothing is written to the tenant.
import { spawn } from 'node:child_process';
import { graphGet } from './graph.mjs';
import { decodeJwtPayload, scopeList, delegatedReady } from '../lib/tokenclaims.js';
import { GRAPH_APP_ID, EXO_APP_ID, ROLE_TEMPLATES } from '../lib/setup.js';
import { clip } from '../lib/logsafe.js';

export async function checkOpenId(tenant, fetchImpl = fetch) {
  if (!tenant) return { ok: false, message: 'ENTRA_TENANT_ID is not set.' };
  try {
    const res = await fetchImpl(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/v2.0/.well-known/openid-configuration`, { method: 'GET', signal: AbortSignal.timeout(10000) });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.issuer) return { ok: true, issuer: body.issuer };
    const text = body.error_description || body.error || `HTTP ${res.status}`;
    if (/AADSTS90002|not found/i.test(text)) return { ok: false, message: `Entra says tenant ${tenant} does not exist. ENTRA_TENANT_ID is wrong.`, detail: clip(text) };
    return { ok: false, message: `Entra answered, but not with the tenant metadata (${clip(text, 120)}).`, detail: clip(text) };
  } catch (error) {
    return { ok: false, message: `The container could not reach login.microsoftonline.com (${error.cause?.code || error.name || 'network error'}).`, detail: clip(error.message || '') };
  }
}

let psCache = null;
export function checkPowershell() {
  if (psCache && Date.now() - psCache.at < 10 * 60 * 1000) return Promise.resolve(psCache.value);
  const command = "$m = Get-Module -ListAvailable ExchangeOnlineManagement | Sort-Object Version -Descending | Select-Object -First 1; [pscustomobject]@{ pwsh = $PSVersionTable.PSVersion.ToString(); module = if ($m) { $m.Version.ToString() } else { '' } } | ConvertTo-Json -Compress";
  return new Promise(resolve => {
    let out = '';
    let child;
    try {
      child = spawn('pwsh', ['-NoProfile', '-NonInteractive', '-Command', command], { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      resolve({ ok: false, message: `PowerShell 7 could not start (${error.code || error.message}).` });
      return;
    }
    const timer = setTimeout(() => { child.kill(); resolve({ ok: false, message: 'PowerShell 7 did not answer within 30 seconds.' }); }, 30000);
    child.stdout.on('data', d => { out += d; });
    child.on('error', error => { clearTimeout(timer); resolve({ ok: false, message: `PowerShell 7 is not installed here (${error.code || error.message}). It is in the Docker image, so run Ex360 in Docker.` }); });
    child.on('close', () => {
      clearTimeout(timer);
      try {
        const json = JSON.parse(out.trim().split('\n').pop());
        const value = { ok: true, pwsh: json.pwsh, module: json.module };
        psCache = { at: Date.now(), value };
        resolve(value);
      } catch {
        resolve({ ok: false, message: 'PowerShell 7 ran but did not report its version.', detail: clip(out) });
      }
    });
  });
}

function failure(res, what) {
  return { ok: false, message: `${what}: ${res.message || res.label || `HTTP ${res.status}`}`, detail: clip(JSON.stringify(res.body?.error || res.body || '')) };
}

async function readApp(token, clientId) {
  const res = await graphGet(token, `/applications?$filter=appId eq '${clientId}'&$select=id,appId,displayName,signInAudience,isFallbackPublicClient,publicClient,web,spa,requiredResourceAccess`, 'directory');
  if (!res.ok) return failure(res, 'Reading the app registration failed');
  const value = res.json?.value?.[0];
  if (!value) return { ok: false, message: `No app registration with application id ${clientId} was found in this tenant. Check ENTRA_CLIENT_ID.` };
  return { ok: true, value };
}

async function servicePrincipal(token, appId, select) {
  const res = await graphGet(token, `/servicePrincipals?$filter=appId eq '${appId}'&$select=${select}`, 'directory');
  if (!res.ok) return { ok: false, res };
  return { ok: true, value: res.json?.value?.[0] || null };
}

async function readGrants(token, clientId) {
  const [mine, graph, exo] = await Promise.all([
    servicePrincipal(token, clientId, 'id,appId'),
    servicePrincipal(token, GRAPH_APP_ID, 'id,appId,oauth2PermissionScopes'),
    servicePrincipal(token, EXO_APP_ID, 'id,appId,oauth2PermissionScopes'),
  ]);
  const catalog = {
    graph: (graph.value?.oauth2PermissionScopes || []).map(s => ({ id: s.id, value: s.value })),
    exo: (exo.value?.oauth2PermissionScopes || []).map(s => ({ id: s.id, value: s.value })),
  };
  if (!mine.ok) return { grants: failure(mine.res, 'Reading the enterprise application failed'), catalog };
  if (!mine.value) return { grants: { ok: false, message: 'The app has no enterprise application (service principal) in this tenant yet. It is created the first time anyone signs in, or when an admin grants consent.' }, catalog };
  const res = await graphGet(token, `/oauth2PermissionGrants?$filter=clientId eq '${mine.value.id}'`, 'directory');
  if (!res.ok) return { grants: failure(res, 'Reading the consent grants failed'), catalog };
  return {
    grants: { ok: true, value: res.json?.value || [], resourceSp: { graph: graph.value?.id || '', exo: exo.value?.id || '' } },
    catalog,
  };
}

async function readRoles(token, payload) {
  const res = await graphGet(token, '/me/transitiveMemberOf/microsoft.graph.directoryRole?$select=displayName,roleTemplateId', 'roles');
  if (res.ok) return (res.json?.value || []).map(r => r.displayName).filter(Boolean);
  return (payload?.wids || []).map(id => ROLE_TEMPLATES[id]).filter(Boolean);
}

async function readTenantName(token) {
  const res = await graphGet(token, '/organization?$select=displayName', 'directory');
  return res.ok ? (res.json?.value?.[0]?.displayName || '') : '';
}

export async function gatherSetupFacts({ env, graphScopes, browserHost, session, staleCookie, outlookReports, exoLive }) {
  const graphToken = session?.graph?.access_token || '';
  const payload = decodeJwtPayload(graphToken);
  const [openid, powershell] = await Promise.all([checkOpenId(env.tenantId), checkPowershell()]);
  const facts = {
    env, graphScopes, browserHost, openid, powershell, outlookReports, exoLive, checkedAt: new Date().toISOString(),
    session: {
      signedIn: Boolean(graphToken),
      staleCookie: Boolean(staleCookie),
      upn: session?.account?.username || payload?.upn || '',
      graphScopes: scopeList(payload),
      roles: [],
      refreshError: session?.refreshError || null,
      purview: Boolean(session?.purview),
      compliance: delegatedReady(session?.compliance?.access_token, 'compliance'),
      exo: {
        present: Boolean(session?.exo?.access_token),
        ready: delegatedReady(session?.exo?.access_token, 'exchange'),
        error: session?.exoError?.message ? clip(session.exoError.message) : '',
      },
    },
  };
  if (graphToken) {
    const [app, consent, roles, tenantName] = await Promise.all([
      readApp(graphToken, env.clientId), readGrants(graphToken, env.clientId), readRoles(graphToken, payload), readTenantName(graphToken),
    ]);
    facts.app = app;
    facts.grants = consent.grants;
    facts.catalog = consent.catalog;
    facts.session.roles = roles;
    facts.tenantName = tenantName;
  }
  return facts;
}
