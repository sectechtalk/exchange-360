// Setup steps: every one-off piece of configuration Ex360 depends on, and a live check for each.
// This file is pure. The server gathers the facts (server/setup.mjs) and this file turns them into
// plain-words pass/fail rows with the exact fix. Nothing here calls the network or changes the tenant.

export const GRAPH_APP_ID = '00000003-0000-0000-c000-000000000000';
export const EXO_APP_ID = '00000002-0000-0ff1-ce00-000000000000';
export const MIN_EXO_MODULE = '3.7.2';

// OpenID Connect scopes are Graph scopes too, but Entra grants them without listing them on the app.
const OIDC = new Set(['openid', 'profile', 'offline_access', 'email']);

// Entra built-in role template ids (Microsoft Learn, Entra built-in roles reference).
export const ROLE_TEMPLATES = {
  '62e90394-69f5-4237-9190-012177145e10': 'Global Administrator',
  '29232cdf-9323-42fd-ade2-1d097af3e4de': 'Exchange Administrator',
  'f2ef992c-3afb-46b9-b7cf-a126ee74c451': 'Global Reader',
  '31392ffb-586c-42d1-9346-e59415a2cc4e': 'Exchange Recipient Administrator',
  '5d6b6bb7-de71-4623-b4af-96380a352509': 'Security Reader',
  '194ae4cb-b126-40b2-bd5b-6091b380977d': 'Security Administrator',
  '17315797-102d-40b4-93e0-432062caca18': 'Compliance Administrator',
  'e6d1a23a-da11-4be4-9570-befc86d067a7': 'Compliance Data Administrator',
  '4a5d8f65-41da-4de4-8968-e035b65339cf': 'Reports Reader',
  'e8611ab8-c189-46e8-94e1-60213ab1f814': 'Privileged Role Administrator',
};
// Any one of these lets the Exchange Online read pages work (View-Only Organization Management or better).
export const EXCHANGE_READ_ROLES = ['Global Administrator', 'Exchange Administrator', 'Global Reader'];
export const CONSENT_ROLES = 'Global Administrator or Privileged Role Administrator';

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isGuid(value) { return GUID.test(String(value || '').trim()); }

export function entraLinks(clientId, tenantId) {
  const id = String(clientId || '').trim() || 'your-client-id';
  const blade = `https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~`;
  return {
    overview: `${blade}/Overview/appId/${id}/isMSAApp~/false`,
    authentication: `${blade}/Authentication/appId/${id}/isMSAApp~/false`,
    apiPermissions: `${blade}/CallAnAPI/appId/${id}/isMSAApp~/false`,
    enterpriseApp: `https://entra.microsoft.com/#view/Microsoft_AAD_IAM/ManagedAppMenuBlade/~/Permissions/appId/${id}`,
    myRoles: 'https://entra.microsoft.com/#view/Microsoft_Azure_PIMCommon/ActivationMenuBlade/~/aadmigratedroles',
    roles: 'https://entra.microsoft.com/#view/Microsoft_AAD_IAM/AllRolesBlade',
    tenant: tenantId ? `https://entra.microsoft.com/#view/Microsoft_AAD_IAM/TenantOverview.ReactView/tenantId/${tenantId}` : 'https://entra.microsoft.com/',
  };
}

export function versionAtLeast(have, want) {
  const a = String(have || '').split(/[.-]/).map(n => Number.parseInt(n, 10) || 0);
  const b = String(want || '').split(/[.-]/).map(n => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if ((a[i] || 0) > (b[i] || 0)) return true;
    if ((a[i] || 0) < (b[i] || 0)) return false;
  }
  return true;
}

export function graphScopesNeeded(graphScopes) {
  return [...new Set((graphScopes || []).filter(s => s && !OIDC.has(s) && !s.includes('/')))];
}

// Names of delegated permissions the app registration lists for one resource.
export function requestedScopeNames(app, resourceAppId, scopeCatalog) {
  const entry = (app?.requiredResourceAccess || []).find(r => r.resourceAppId === resourceAppId);
  if (!entry) return [];
  const byId = new Map((scopeCatalog || []).map(s => [String(s.id).toLowerCase(), s.value]));
  return entry.resourceAccess.filter(a => a.type === 'Scope').map(a => byId.get(String(a.id).toLowerCase()) || a.id);
}

// Scopes granted for everyone in the tenant (admin consent) for one resource service principal.
export function adminConsentedScopes(grants, resourceSpId) {
  const out = new Set();
  for (const g of grants || []) {
    if (g.consentType !== 'AllPrincipals' || g.resourceId !== resourceSpId) continue;
    for (const s of String(g.scope || '').split(/\s+/).filter(Boolean)) out.add(s);
  }
  return out;
}

function row(id, group, title, status, summary, extra = {}) {
  return { id, group, title, status, summary, ...extra };
}

function missingList(names) {
  return names.length > 6 ? `${names.slice(0, 6).join(', ')} and ${names.length - 6} more` : names.join(', ');
}

// facts: see server/setup.mjs gatherSetupFacts for the shape.
export function evaluateSetup(facts) {
  const f = facts || {};
  const env = f.env || {};
  const links = entraLinks(env.clientId, env.tenantId);
  const rows = [];
  const signedIn = Boolean(f.session?.signedIn);
  const needSignIn = { label: 'Sign in', href: '/auth/login?return=setup' };
  const envFile = '$HOME\\exchange-360\\.env';
  const tenantName = f.tenantName || 'your organization';
  const rebuild = 'cd $HOME\\exchange-360; docker compose up --build -d';

  // 1. .env values
  const badEnv = [];
  if (!isGuid(env.tenantId)) badEnv.push('ENTRA_TENANT_ID');
  if (!isGuid(env.clientId)) badEnv.push('ENTRA_CLIENT_ID');
  rows.push(badEnv.length
    ? row('env', 'This PC', 'Tenant and app ids are in .env', 'fail', `${badEnv.join(' and ')} ${badEnv.length > 1 ? 'are' : 'is'} missing or not a GUID, so sign-in cannot start.`, {
      fix: { who: 'You', steps: [`Open ${envFile} in Notepad.`, 'Copy the Directory (tenant) ID and Application (client) ID from the app\'s Overview page in Entra into ENTRA_TENANT_ID and ENTRA_CLIENT_ID.', `Save the file, then run in PowerShell 7: ${rebuild}`], link: { label: 'Open the app Overview in Entra', url: links.overview } },
    })
    : row('env', 'This PC', 'Tenant and app ids are in .env', 'pass', `Tenant ${env.tenantId} and app ${env.clientId} are set.`));

  // 1b. Exchange scope in .env (older copies of .env.example asked for the bare name Exchange.Manage)
  const exoScope = String(env.exoScope || '');
  rows.push(exoScope === 'https://outlook.office365.com/.default'
    ? row('exo-scope', 'This PC', 'Exchange scope in .env is the .default scope', 'pass', 'EXO_SCOPE is https://outlook.office365.com/.default.')
    : row('exo-scope', 'This PC', 'Exchange scope in .env is the .default scope', 'fail', `EXO_SCOPE is "${exoScope || '(empty)'}". Entra looks a bare name like Exchange.Manage up on Microsoft Graph and the Exchange sign-in fails with AADSTS650053.`, {
      fix: { who: 'You', steps: [`Open ${envFile} in Notepad.`, 'Change the EXO_SCOPE line to: EXO_SCOPE=https://outlook.office365.com/.default', `Save, then run: ${rebuild}`] },
    }));

  // 2. Redirect URI and the address in the browser
  const redirect = String(env.redirectUri || '');
  let redirectHost = '';
  try { redirectHost = new URL(redirect).host; } catch { /* checked below */ }
  const browserHost = String(f.browserHost || '');
  if (!redirectHost) {
    rows.push(row('redirect', 'This PC', 'Redirect URI matches this address', 'fail', 'ENTRA_REDIRECT_URI is not a valid URL.', {
      fix: { who: 'You', steps: [`Set ENTRA_REDIRECT_URI=http://localhost:8360/auth/callback in ${envFile}.`, `Run: ${rebuild}`] },
    }));
  } else if (browserHost && browserHost !== redirectHost) {
    rows.push(row('redirect', 'This PC', 'Redirect URI matches this address', 'fail', `You opened Ex360 at ${browserHost}, but sign-in returns to ${redirectHost}. The browser keeps the sign-in cookie per address, so you look signed out after every sign-in.`, {
      fix: { who: 'You', steps: [`Close this tab and open http://${redirectHost}/#setup instead.`] },
      action: { label: `Open http://${redirectHost}/#setup`, href: `http://${redirectHost}/#setup` },
    }));
  } else {
    rows.push(row('redirect', 'This PC', 'Redirect URI matches this address', 'pass', `Sign-in returns to ${redirect}, the same address this page is on.`));
  }

  // 3. Container can reach Entra and the tenant exists
  const oidc = f.openid || {};
  rows.push(oidc.ok
    ? row('tenant', 'This PC', 'The container reaches Entra and the tenant exists', 'pass', `login.microsoftonline.com answered for tenant ${env.tenantId}.`)
    : row('tenant', 'This PC', 'The container reaches Entra and the tenant exists', 'fail', oidc.message || 'The container could not read the tenant sign-in metadata.', {
      detail: oidc.detail || '',
      fix: { who: 'You', steps: ['If the message says the tenant was not found, ENTRA_TENANT_ID is wrong. Copy it again from the app Overview page.', 'If it is a network error, check that Docker Desktop is running and this PC is online, then click Run every check again.'], link: { label: 'Open the app Overview in Entra', url: links.overview } },
    }));

  // 4. PowerShell and the Exchange module inside the container
  const ps = f.powershell || {};
  if (!ps.ok) {
    rows.push(row('pwsh', 'This PC', 'PowerShell 7 and ExchangeOnlineManagement are in the container', 'fail', ps.message || 'PowerShell 7 was not found. You are probably running Ex360 with node directly instead of in Docker.', {
      fix: { who: 'You', steps: ['Run Ex360 in Docker. In PowerShell 7 run:', rebuild] },
    }));
  } else if (!ps.module) {
    rows.push(row('pwsh', 'This PC', 'PowerShell 7 and ExchangeOnlineManagement are in the container', 'fail', `PowerShell ${ps.pwsh} is there, but the ExchangeOnlineManagement module is not.`, {
      fix: { who: 'You', steps: ['Rebuild the image so the module is installed:', 'cd $HOME\\exchange-360; docker compose build --no-cache; docker compose up -d'] },
    }));
  } else if (!versionAtLeast(ps.module, MIN_EXO_MODULE)) {
    rows.push(row('pwsh', 'This PC', 'PowerShell 7 and ExchangeOnlineManagement are in the container', 'fail', `ExchangeOnlineManagement ${ps.module} is older than ${MIN_EXO_MODULE}. Ex360 needs ${MIN_EXO_MODULE} or later for -AccessToken with -DisableWAM.`, {
      fix: { who: 'You', steps: ['Rebuild without the cache so the newest module is installed:', 'cd $HOME\\exchange-360; docker compose build --no-cache; docker compose up -d'] },
    }));
  } else {
    rows.push(row('pwsh', 'This PC', 'PowerShell 7 and ExchangeOnlineManagement are in the container', 'pass', `PowerShell ${ps.pwsh} with ExchangeOnlineManagement ${ps.module}.`));
  }

  // 5. Signed in
  if (f.session?.staleCookie && !signedIn) {
    rows.push(row('signin', 'Your sign-in', 'You are signed in', 'fail', 'Ex360 restarted since you last signed in, so your sign-in was cleared. Sign-ins are kept in memory only and never written to disk.', {
      action: needSignIn,
    }));
  } else if (!signedIn) {
    rows.push(row('signin', 'Your sign-in', 'You are signed in', 'todo', 'Not signed in yet. Pages that read your tenant ask you to sign in first. The checks below that need your token are waiting.', {
      fix: { who: 'You', steps: [`Click Sign in. Use your own admin account${env.organization ? ` in ${env.organization}` : ''} and complete MFA.`] },
      action: needSignIn,
    }));
  } else {
    rows.push(row('signin', 'Your sign-in', 'You are signed in', 'pass', `Signed in as ${f.session.upn || 'an unknown account'}.`));
  }
  if (f.session?.refreshError) {
    rows.push(row('refresh', 'Your sign-in', 'Your sign-in renews by itself', 'fail', `Ex360 could not renew your ${f.session.refreshError.kind} token: ${f.session.refreshError.message}`, {
      fix: { who: 'You', steps: ['Click Sign out at the bottom of the left rail, then Sign in again.'] },
      action: { label: 'Sign out', href: '/auth/logout' },
    }));
  }

  // App registration rows need a Graph read of the app (Directory.Read.All).
  const app = f.app;
  const appWait = signedIn ? null : 'Sign in first. This is read from Entra with your own permissions.';
  const appGroup = 'App registration (one time)';

  // 6. Public client
  if (appWait) {
    rows.push(row('platform', appGroup, 'Redirect URIs are on Mobile and desktop applications', 'wait', appWait));
  } else if (!app?.ok) {
    rows.push(row('platform', appGroup, 'Redirect URIs are on Mobile and desktop applications', 'warn', app?.message || 'Ex360 could not read the app registration.', { detail: app?.detail || '' }));
  } else {
    const a = app.value;
    const publicUris = a.publicClient?.redirectUris || [];
    const webUris = a.web?.redirectUris || [];
    const spaUris = a.spa?.redirectUris || [];
    const problems = [];
    const steps = ['In Entra, open the app, then Authentication.'];
    if (webUris.includes(redirect) || spaUris.includes(redirect)) {
      problems.push(`${redirect} is registered under ${webUris.includes(redirect) ? 'Web' : 'Single-page application'}. That makes Entra demand a client secret and sign-in fails with AADSTS7000218 (or AADSTS9002327 for single-page).`);
      steps.push(`Under ${webUris.includes(redirect) ? 'Web' : 'Single-page application'}, click the delete (bin) icon next to ${redirect}.`);
    }
    if (!publicUris.includes(redirect)) {
      problems.push(`${redirect} is not registered under Mobile and desktop applications.`);
      steps.push('Click Add a platform, then Mobile and desktop applications.', `In Custom redirect URIs, enter ${redirect}, then click Configure.`);
    }
    if (a.isFallbackPublicClient !== true) {
      problems.push('Allow public client flows is set to No.');
      steps.push('Under Advanced settings, set Allow public client flows to Yes.');
    }
    steps.push('Click Save at the top. Then click Run every check on this page.');
    rows.push(problems.length
      ? row('platform', appGroup, 'Redirect URIs are on Mobile and desktop applications', 'fail', problems.join(' '), { fix: { who: `You, as ${CONSENT_ROLES} or the app owner`, steps, link: { label: 'Open Authentication in Entra', url: links.authentication } } })
      : row('platform', appGroup, 'Redirect URIs are on Mobile and desktop applications', 'pass', `${redirect} is a Mobile and desktop redirect, there is no Web or single-page copy of it, and public client flows are allowed.`));
  }

  // 7 and 8. Permissions listed on the app, then admin consent for them.
  const graphNeeded = graphScopesNeeded(f.graphScopes);
  const exoNeeded = ['Exchange.Manage'];
  const permissionRows = [
    { id: 'graph', name: 'Microsoft Graph', appId: GRAPH_APP_ID, needed: graphNeeded },
    { id: 'exo', name: 'Office 365 Exchange Online', appId: EXO_APP_ID, needed: exoNeeded },
  ];
  for (const res of permissionRows) {
    const title = `${res.name} permissions are on the app`;
    if (appWait) { rows.push(row(`perm-${res.id}`, appGroup, title, 'wait', appWait)); continue; }
    if (!app?.ok) { rows.push(row(`perm-${res.id}`, appGroup, title, 'warn', 'Skipped because the app registration could not be read.')); continue; }
    const listed = new Set(requestedScopeNames(app.value, res.appId, f.catalog?.[res.id]));
    const missing = res.needed.filter(s => !listed.has(s));
    const addSteps = ['In Entra, open the app, then API permissions.', 'Click Add a permission.',
      res.id === 'graph' ? 'Click Microsoft Graph, then Delegated permissions.' : 'Click the APIs my organization uses tab, search for Office 365 Exchange Online, click it, then Delegated permissions.',
      `Tick ${missingList(missing)}. Click Add permissions.`, 'Then do the admin consent step below.'];
    rows.push(missing.length
      ? row(`perm-${res.id}`, appGroup, title, 'fail', `Missing on the app: ${missing.join(', ')}.`, { fix: { who: `You, as ${CONSENT_ROLES} or the app owner`, steps: addSteps, link: { label: 'Open API permissions in Entra', url: links.apiPermissions } } })
      : row(`perm-${res.id}`, appGroup, title, 'pass', `All ${res.needed.length} delegated permission${res.needed.length > 1 ? 's are' : ' is'} listed.`));
  }
  for (const res of permissionRows) {
    const title = `Admin consent covers ${res.name}`;
    if (appWait) { rows.push(row(`consent-${res.id}`, appGroup, title, 'wait', appWait)); continue; }
    if (!f.grants?.ok) { rows.push(row(`consent-${res.id}`, appGroup, title, 'warn', f.grants?.message || 'Ex360 could not read the consent grants.', { detail: f.grants?.detail || '' })); continue; }
    const spId = f.grants.resourceSp?.[res.id];
    const granted = adminConsentedScopes(f.grants.value, spId);
    const missing = res.needed.filter(s => !granted.has(s));
    rows.push(missing.length
      ? row(`consent-${res.id}`, appGroup, title, 'fail', `Not consented for the organization: ${missing.join(', ')}.${res.id === 'exo' ? ' Without it the Exchange token cannot run any Exchange cmdlet, and every Exchange page says Not authorized.' : ''}`, {
        fix: { who: CONSENT_ROLES, steps: ['In Entra, open the app, then API permissions.', `Click Grant admin consent for ${tenantName}, then Yes.`, `Wait until every row shows a green tick and Granted for ${tenantName} in the Status column.`, 'Come back here and click Run every check. Ex360 picks up the new consent without a new sign-in. If the token rows below still fail, click Sign out, then Sign in.'], link: { label: 'Open API permissions in Entra', url: links.apiPermissions } },
      })
      : row(`consent-${res.id}`, appGroup, title, 'pass', `Granted for the organization (${res.needed.length === 1 ? res.needed[0] : `${res.needed.length} permissions`}).`));
  }

  // 9. What the tokens actually carry
  const tokenGroup = 'Tokens and roles';
  if (!signedIn) {
    rows.push(row('token-graph', tokenGroup, 'Your Graph token has the permissions', 'wait', 'Sign in first.'));
    rows.push(row('token-exo', tokenGroup, 'Your Exchange token has Exchange.Manage', 'wait', 'Sign in first.'));
  } else {
    const have = new Set(f.session.graphScopes || []);
    const missing = graphNeeded.filter(s => !have.has(s));
    rows.push(missing.length
      ? row('token-graph', tokenGroup, 'Your Graph token has the permissions', 'fail', `Your current token is missing ${missingList(missing)}. A token only carries what was consented when you signed in.`, {
        fix: { who: 'You', steps: ['If the admin consent row above fails, fix that first.', 'Click Sign out, then Sign in, so the new token picks up the consent.'] },
        action: { label: 'Sign out', href: '/auth/logout' },
      })
      : row('token-graph', tokenGroup, 'Your Graph token has the permissions', 'pass', `All ${graphNeeded.length} Graph permissions are in your token.`));
    const exo = f.session.exo || {};
    if (exo.ready) {
      rows.push(row('token-exo', tokenGroup, 'Your Exchange token has Exchange.Manage', 'pass', 'Ex360 holds an Exchange Online token with Exchange.Manage in it.'));
    } else {
      rows.push(row('token-exo', tokenGroup, 'Your Exchange token has Exchange.Manage', 'fail', exo.present
        ? 'Ex360 has an Exchange Online token, but Exchange.Manage is not in it.'
        : `Ex360 could not get an Exchange Online token.${exo.error ? ` Entra said: ${exo.error}` : ''}`, {
        fix: { who: 'You', steps: ['Fix the Office 365 Exchange Online consent row above first.', 'Click Run every check. Ex360 asks Entra for the Exchange token again from your existing sign-in.', 'If it still fails, click Sign in for Exchange Online.'] },
        action: { label: 'Sign in for Exchange Online', href: '/auth/login?resource=exchange&return=setup' },
      }));
    }
  }

  // 10. Entra role
  if (!signedIn) {
    rows.push(row('role', tokenGroup, 'You hold an Entra role that can read Exchange', 'wait', 'Sign in first.'));
  } else {
    const roles = f.session.roles || [];
    const ok = roles.filter(r => EXCHANGE_READ_ROLES.includes(r));
    rows.push(ok.length
      ? row('role', tokenGroup, 'You hold an Entra role that can read Exchange', 'pass', `Active role${roles.length > 1 ? 's' : ''}: ${roles.join(', ')}.`)
      : row('role', tokenGroup, 'You hold an Entra role that can read Exchange', 'fail', roles.length
        ? `Your active roles (${roles.join(', ')}) do not include ${EXCHANGE_READ_ROLES.join(', ')}. Exchange pages will say Not authorized for you.`
        : `No active Entra admin role was found on your sign-in. Exchange pages need one of ${EXCHANGE_READ_ROLES.join(', ')}.`, {
        fix: { who: 'You, or a Privileged Role Administrator', steps: ['If you use Privileged Identity Management, open My roles and click Activate next to Global Reader or Exchange Administrator.', 'Otherwise ask a Privileged Role Administrator to assign you Global Reader (read-only is enough for Ex360 v1).', 'After the role is active, click Sign out, then Sign in, so the token carries it.'], link: { label: 'Open My roles in Entra', url: links.myRoles } },
      }));
  }

  // 11. Live Exchange Online PowerShell connection
  const live = f.exoLive;
  const liveTitle = 'Exchange Online PowerShell connects as you';
  if (!live) {
    rows.push(row('exo-live', tokenGroup, liveTitle, 'wait', 'Not run yet. Click Run every check to connect for real. It takes about 20 seconds.'));
  } else if (live.ok) {
    rows.push(row('exo-live', tokenGroup, liveTitle, 'pass', `Connected to ${live.organization || 'Exchange Online'} as ${live.user || 'you'} and read Get-OrganizationConfig.`));
  } else {
    rows.push(row('exo-live', tokenGroup, liveTitle, 'fail', live.message || 'Connect-ExchangeOnline failed.', {
      detail: live.detail || '',
      fix: live.consentUrl
        ? { who: CONSENT_ROLES, steps: ['Grant admin consent (see the consent rows above).', 'Click Run every check.'], link: { label: 'Open API permissions in Entra', url: live.consentUrl } }
        : { who: 'You', steps: ['Read Details for the exact error.', 'Make sure every row above passes, then click Run every check.'] },
    }));
  }

  // Optional pieces. Only needed for the pages they name.
  const optGroup = 'Optional';
  rows.push(row('purview', optGroup, 'Purview Graph sign-in (Sensitivity labels, Retention labels, eDiscovery, Defender XDR)', f.session?.purview ? 'pass' : 'optional',
    f.session?.purview ? 'Connected.' : 'Not connected. Only those pages need it. It needs six more Graph permissions on the app; docs/auth.md lists them.',
    f.session?.purview ? {} : { action: { label: 'Sign in for Purview reads', href: '/auth/login?resource=purview&return=setup' } }));
  rows.push(row('compliance', optGroup, 'Security & Compliance PowerShell sign-in (DLP, Retention, Audit search)', f.session?.compliance ? 'pass' : 'optional',
    f.session?.compliance ? 'Connected.' : 'Not connected. Only the Compliance pages need it.',
    f.session?.compliance ? {} : { action: { label: 'Sign in for compliance PowerShell', href: '/auth/login?resource=compliance&return=setup' } }));
  rows.push(row('outlook', optGroup, 'Outlook collector has reported from this PC', f.outlookReports ? 'pass' : 'optional',
    f.outlookReports ? `${f.outlookReports} report${f.outlookReports > 1 ? 's' : ''} received since Ex360 started.` : 'No report yet. Only the Outlook on this PC page needs it. Run Collect-Ex360Outlook.ps1 from that page in Windows PowerShell on this PC.',
    f.outlookReports ? {} : { action: { label: 'Open Outlook on this PC', href: '#outlook' } }));

  const required = rows.filter(r => r.group !== optGroup);
  const summary = {
    total: required.length,
    pass: required.filter(r => r.status === 'pass').length,
    fail: required.filter(r => r.status === 'fail').length,
    waiting: required.filter(r => r.status === 'wait' || r.status === 'todo' || r.status === 'warn').length,
  };
  summary.ready = summary.pass === summary.total;
  return { rows, summary, checkedAt: f.checkedAt || new Date().toISOString() };
}

// The written record of every one-off setting, so it is never only in someone's head.
export function setupRecord(env, graphScopes) {
  const links = entraLinks(env?.clientId, env?.tenantId);
  return [
    { item: 'Tenant', value: `${env?.organization || 'not set'} (${env?.tenantId || 'not set'})`, where: 'ENTRA_TENANT_ID and ENTRA_ORGANIZATION in .env' },
    { item: 'App registration', value: `Ex360, application (client) id ${env?.clientId || 'not set'}${env?.objectId ? `, object id ${env.objectId}` : ''}`, where: links.overview },
    { item: 'Supported account types', value: 'Accounts in this organizational directory only (single tenant)', where: links.authentication },
    { item: 'Platform', value: `Mobile and desktop applications: ${env?.redirectUri || 'http://localhost:8360/auth/callback'} and http://localhost. No Web or single-page redirect URIs.`, where: links.authentication },
    { item: 'Allow public client flows', value: 'Yes. There is no client secret and no certificate.', where: links.authentication },
    { item: 'Microsoft Graph delegated permissions', value: graphScopesNeeded(graphScopes).join(', '), where: links.apiPermissions },
    { item: 'Office 365 Exchange Online delegated permission', value: 'Exchange.Manage (requested as https://outlook.office365.com/.default)', where: links.apiPermissions },
    { item: 'Admin consent', value: `Granted once for the whole organization by a ${CONSENT_ROLES}, on API permissions.`, where: links.apiPermissions },
    { item: 'Your role', value: `${EXCHANGE_READ_ROLES.join(' or ')}, active (activate it first if you use PIM).`, where: links.myRoles },
    { item: 'Container', value: 'Docker Desktop on this PC. Start-Ex360.ps1 copies .env.example to .env once and runs docker compose up --build -d. Listens on 127.0.0.1:8360 only.', where: '$HOME\\exchange-360' },
    { item: 'Browser address', value: 'Always http://localhost:8360. 127.0.0.1 loses the sign-in cookie.', where: 'http://localhost:8360/#setup' },
    { item: 'Optional: Purview reads', value: 'Six more Graph delegated permissions, listed in docs/auth.md, plus admin consent.', where: links.apiPermissions },
    { item: 'Optional: Outlook collector', value: 'Collect-Ex360Outlook.ps1, run in Windows PowerShell on this PC, posts a read-only report to Ex360.', where: 'http://localhost:8360/#outlook' },
  ];
}
