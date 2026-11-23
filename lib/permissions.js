// What a refused call should say. The label is always "Not authorized" plus the permission
// and a role that includes it. An empty table is not a substitute.
export const CALLS = {
  skus: { permission: 'Organization.Read.All', role: 'Global Reader' },
  domains: { permission: 'Domain.Read.All', role: 'Global Reader' },
  directory: { permission: 'Directory.Read.All', role: 'Global Reader' },
  users: { permission: 'User.Read.All', role: 'Global Reader' },
  signins: { permission: 'AuditLog.Read.All', role: 'Security Reader or Reports Reader', license: 'Microsoft Entra ID P1' },
  health: { permission: 'ServiceHealth.Read.All', role: 'Global Reader' },
  messages: { permission: 'ServiceMessage.Read.All', role: 'Global Reader' },
  mail: { permission: 'Mail.Read', role: 'the mailbox owner, or Mail.Read.Shared when you can open that mailbox' },
  mailboxSettings: { permission: 'MailboxSettings.Read', role: 'the mailbox owner' },
  roles: { permission: 'RoleManagement.Read.Directory', role: 'Global Reader' },
  reports: { permission: 'Reports.Read.All', role: 'Reports Reader' },
  security: { permission: 'SecurityEvents.Read.All', role: 'Security Reader' },
  policy: { permission: 'Policy.Read.All', role: 'Security Reader or Conditional Access Administrator' },
  exchange: { permission: 'Exchange.Manage', role: 'View-Only Organization Management (included with Global Reader) plus the Exchange.Manage delegated scope' },
  trace: { permission: 'Exchange.Manage', role: 'View-Only Recipients, Security Reader, or another Exchange role that includes message tracking' },
  labels: { permission: 'InformationProtectionPolicy.Read', role: 'the signed-in user can read their own published labels; a Compliance Administrator sees the tenant configuration in Purview' },
  records: { permission: 'RecordsManagement.Read.All', role: 'Compliance Administrator or a Purview role that can read records management' },
  ediscovery: { permission: 'eDiscovery.Read.All', role: 'eDiscovery Manager or Compliance Administrator' },
  auditQuery: { permission: 'AuditLogsQuery.Read.All', role: 'Audit Reader or Compliance Administrator' },
  incidents: { permission: 'SecurityIncident.Read.All', role: 'Security Reader' },
  alerts: { permission: 'SecurityAlert.Read.All', role: 'Security Reader' },
  ipps: { permission: 'https://ps.compliance.protection.outlook.com/.default', role: 'Compliance Administrator, or the Purview role group that can read the cmdlet. This is a separate token from Graph. Microsoft Learn documents Connect-IPPSSession -AccessToken and does not publish a permission GUID to add on a customer app.' },
  directoryAudit: { permission: 'AuditLog.Read.All', role: 'Audit Reader or Global Reader' },
};

// New delegated permissions to add on the Ex360 app registration. GUIDs are the delegated
// identifiers from Microsoft Graph permissions reference (checked 2026-11-17).
export const NEW_DELEGATED = [
  { resource: 'Microsoft Graph', name: 'InformationProtectionPolicy.Read', id: '4ad84827-5578-4e18-ad7a-86530b12f884', why: 'Read published sensitivity labels and label policy settings for the signed-in user. InformationProtectionPolicy.Read.All is application-only, so it is not requested.' },
  { resource: 'Microsoft Graph', name: 'RecordsManagement.Read.All', id: '07f995eb-fc67-4522-ad66-2b8ca8ea3efd', why: 'Read retention labels and records-management configuration.' },
  { resource: 'Microsoft Graph', name: 'eDiscovery.Read.All', id: '99201db3-7652-4d5a-809a-bdb94f85fe3c', why: 'Read eDiscovery cases and related holds.' },
  { resource: 'Microsoft Graph', name: 'AuditLogsQuery.Read.All', id: '1d9e7ac3-0eca-442c-82f9-e92625af6e6d', why: 'Read unified audit query results. Ex360 does not create query jobs.' },
  { resource: 'Microsoft Graph', name: 'SecurityAlert.Read.All', id: 'bc257fb8-46b4-4b15-8713-01e91bfbe4ea', why: 'Read Defender XDR alerts. SecurityEvents.Read.All remains for the older alerts API.' },
  { resource: 'Microsoft Graph', name: 'SecurityIncident.Read.All', id: 'b9abcc4f-94fc-4457-9141-d20ce80ec952', why: 'Read Defender XDR incidents.' },
];

export function notAuthorized(call, detail) {
  const row = CALLS[call] || { permission: call, role: 'an administrator who can grant it' };
  return {
    ok: false,
    authorized: false,
    label: 'Not authorized',
    permission: row.permission,
    role: row.role,
    license: row.license || null,
    message: `Not authorized. This needs the delegated permission ${row.permission}. A role that includes it is ${row.role}.${detail ? ` ${detail}` : ''}`,
  };
}

export function notLicensed(feature, needs) {
  return {
    ok: false,
    authorized: true,
    licensed: false,
    label: 'License required',
    feature,
    needs,
    message: `${feature} needs ${needs}. This tenant's subscriptions do not include it.`,
  };
}

export function classifyStatus(status, body, call) {
  const text = typeof body === 'string' ? body : JSON.stringify(body || {});
  if (status === 401 && body !== 'no token' && /InvalidAuthenticationToken|expired|Lifetime validation failed|token is not valid/i.test(text)) {
    return {
      ok: false, authorized: true, expired: true, label: 'Sign in again',
      message: 'Your sign-in token was rejected as expired or invalid (HTTP 401). This is not a permission problem. Ex360 renews tokens by itself, so reload the page. If this stays, click Sign out, then Sign in. Setup steps shows which part of sign-in is failing.',
    };
  }
  if (/Authentication_RequestFromNonPremium|not licensed|Premium license/i.test(text)) {
    const row = CALLS[call] || {};
    return notLicensed(call, row.license || 'a Microsoft 365 license that includes this API');
  }
  if (status === 401 || status === 403 || /Authorization_RequestDenied|AccessDenied|Forbidden|ErrorAccessDenied|Authentication_MSGraphPermissionMissing|not authorized/i.test(text)) {
    return notAuthorized(call);
  }
  return callFailed(status, body, text);
}

// Any other failure: say in plain words what went wrong and what to do, never the raw JSON.
// The raw body stays under Details, and the request ID is named so Microsoft support can find it.
export function callFailed(status, body, text = '') {
  const err = body && typeof body === 'object' ? body.error || {} : {};
  const code = String(err.code || '');
  const said = String(err.message || (typeof body === 'string' ? body : body?.raw || '')).trim().slice(0, 400);
  const inner = err.innerError || err.innererror || {};
  const requestId = inner['request-id'] || inner.requestId || '';
  const when = inner.date || '';
  const http = status ? ` (HTTP ${status}${code ? `, ${code}` : ''})` : code ? ` (${code})` : '';
  let message;
  if (status === 429 || /TooManyRequests|throttl/i.test(code)) {
    message = `Microsoft is limiting how fast this account can make requests right now${http}. Wait a minute, then try again.`;
  } else if (status === 504 || status === 503 || /timeout|ServiceUnavailable|GatewayTimeout/i.test(code)) {
    message = `Microsoft did not answer in time${http}. The service is busy or the query covered too much data. Try again in a minute.`;
  } else if (status === 404 || /NotFound|ResourceNotFound/i.test(code)) {
    message = `Microsoft could not find what was asked for${http}.${said ? ` It said: ${said}` : ''}`;
  } else if (!said) {
    message = `Microsoft returned an error without giving a reason${http}. This usually means the service could not run the request as Ex360 sent it, or had a temporary problem. Try again in a minute. If it keeps happening, report it with the request ID below.`;
  } else if (status === 400 || /BadRequest|Invalid/i.test(code)) {
    message = `Microsoft refused the request as Ex360 sent it${http}. It said: ${said}`;
  } else {
    message = `The call failed${http}. Microsoft said: ${said}`;
  }
  if (requestId) message += ` Request ID: ${requestId}${when ? `, at ${when} UTC` : ''}.`;
  return { ok: false, authorized: true, label: 'Call failed', status: status || null, code: code || null, requestId: requestId || null, message: message.slice(0, 700), detail: String(text || '').slice(0, 2000) || null };
}
