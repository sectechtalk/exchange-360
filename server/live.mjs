import { graphGet, graphList } from './graph.mjs';
import { runExo } from './exo.mjs';
import { checkDomain } from './dns.mjs';
import { notAuthorized, classifyStatus } from '../lib/permissions.js';
import { normalizeSku } from '../lib/licenses.js';
import { recipientType, graphGroupType } from '../lib/recipient-types.js';

function cmd(exo, name) {
  const row = (exo?.commands || []).find(c => c.name === name);
  if (!exo) return { ok: false, ...notAuthorized('exchange') };
  if (!exo.ok && !exo.commands) return exo.ok === false ? exo : { ok: false, message: 'Exchange Online did not return data.' };
  if (!row) return { ok: false, message: `${name} was not returned.` };
  if (!row.ok) {
    const error = row.error || '';
    if (/not authorized|Access Denied|Forbidden|does not have permission/i.test(error)) return notAuthorized(name === 'trace' ? 'trace' : 'exchange', error);
    if (/is not recognized|not recognized|not licensed|Cmdlet not found/i.test(error)) {
      return { ok: false, licensed: false, label: 'License required', message: `${name} is not available. Safe Links, Safe Attachments and impersonation need Microsoft Defender for Office 365. ${error}` };
    }
    return { ok: false, message: error };
  }
  return { ok: true, value: row.value || [] };
}

// PowerShell writes a one-item array as a plain value and some identity types as objects.
// Which Microsoft 365 admin center tab a Graph group lives on, so its link opens that one group.
function groupKindOf(g = {}) {
  if ((g.groupTypes || []).includes('Unified')) return 'm365';
  if (g.securityEnabled) return 'security';
  if (g.mailEnabled) return 'distribution';
  return '';
}
const SYSTEM_PRINCIPAL = /NT AUTHORITY|^S-1-5/i;
function asText(v) {
  if (v == null) return '';
  if (typeof v === 'object') return String(v.Name ?? v.DisplayName ?? v.PrimarySmtpAddress ?? v.value ?? '');
  return String(v);
}
function asList(v) {
  return (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]).map(asText).filter(Boolean);
}
// A read that failed is shown as failed on the page, never as an empty list.
function failure(result, label) {
  if (result.authorized === false) return result;
  return { ok: false, authorized: true, label: result.label || 'Could not read', message: `${label} failed: ${result.message || result.error || 'Exchange Online did not return data.'}` };
}

function list(result) {
  return result.ok ? result.value : result;
}

export async function loadLicenses(token) {
  const res = await graphList(token, '/subscribedSkus?$select=id,skuPartNumber,skuId,capabilityStatus,consumedUnits,prepaidUnits,servicePlans', 'skus');
  if (!res.ok) return res;
  return { ok: true, skus: res.value.map(normalizeSku) };
}

export async function loadDomains(token, { liveDns = true } = {}) {
  const res = await graphList(token, '/domains?$select=id,isDefault,isVerified', 'domains');
  if (!res.ok) return res;
  const domains = [];
  for (const d of res.value) {
    const name = d.id;
    let dns = null;
    let dnsError = '';
    if (liveDns) {
      try { dns = await checkDomain(name); } catch (err) { dnsError = err.message; }
    }
    domains.push({ name, type: d.isVerified ? 'Verified in Entra' : 'Unverified', default: Boolean(d.isDefault), dns, dnsError });
  }
  return { ok: true, domains };
}

// Single recipient search: every recipient that can receive inbound mail. Graph answers fast for users
// (including shared, room and equipment mailboxes and mail users), mail-enabled groups (Microsoft 365,
// distribution, mail-enabled security) and mail contacts. Exchange Online (Get-Recipient -Anr) adds the
// recipients Graph does not list: dynamic distribution lists, room lists and mail-enabled public folders.
// The exact Exchange recipient type is read when one is opened.
export async function searchRecipients(token, q, exchange = null) {
  const safe = String(q || '').replace(/'/g, "''").slice(0, 80);
  if (!safe) return { ok: true, value: [] };
  const byName = `startswith(displayName,'${safe}') or startswith(mail,'${safe}')`;
  const [users, groups, contacts, exo] = await Promise.all([
    loadDirectoryUsers(token, q),
    graphList(token, `/groups?$select=id,displayName,mail,mailEnabled,securityEnabled,groupTypes&$filter=${encodeURIComponent(byName)}&$top=20`, 'directory', 1),
    graphList(token, `/contacts?$select=id,displayName,mail&$filter=${encodeURIComponent(byName)}&$top=20`, 'directory', 1),
    exchange ? exchange(String(q).trim().slice(0, 80)) : Promise.resolve(null),
  ]);
  if (!users.ok) return users;
  const value = users.value.map(u => ({ id: u.id, source: 'user', displayName: u.displayName, primary: u.mail || u.userPrincipalName, type: 'User', typeLabel: 'User or mailbox' }));
  if (groups.ok) {
    for (const g of groups.value) {
      if (!g.mailEnabled || !g.mail) continue;
      const type = graphGroupType(g);
      value.push({ id: g.id, source: 'group', displayName: g.displayName, primary: g.mail, type, typeLabel: recipientType(type).label });
    }
  }
  if (contacts.ok) for (const c of contacts.value) if (c.mail) value.push({ id: c.id, source: 'contact', displayName: c.displayName, primary: c.mail, type: 'MailContact', typeLabel: 'Mail contact' });
  const exoRows = exo ? cmd(exo, 'recipients') : null;
  const merged = mergeExchangeRecipients(value, exoRows?.ok ? exoRows.value : []);
  const skipped = [groups.ok ? null : 'groups', contacts.ok ? null : 'contacts', exo && !exoRows?.ok ? 'Exchange Online (dynamic distribution lists and mail-enabled public folders)' : null].filter(Boolean);
  return { ok: true, value: merged, skipped };
}

// Graph rows win (their ids open the Graph-backed pages), but take Exchange's exact recipient type.
// Exchange-only recipients are added with source 'exo' and opened by their address.
export function mergeExchangeRecipients(graphRows, exoRows) {
  const byAddress = new Map(graphRows.map(r => [String(r.primary || '').toLowerCase(), r]));
  const out = [...graphRows];
  for (const e of exoRows || []) {
    const address = asText(e.PrimarySmtpAddress);
    if (!address) continue;
    const type = asText(e.RecipientTypeDetails);
    const known = byAddress.get(address.toLowerCase());
    if (known) { if (type) { known.type = type; known.typeLabel = recipientType(type).label; } continue; }
    const row = { id: address, source: 'exo', displayName: asText(e.DisplayName) || address, primary: address, type, typeLabel: recipientType(type).label };
    byAddress.set(address.toLowerCase(), row);
    out.push(row);
  }
  return out;
}

export async function loadDirectoryUsers(token, q) {
  const safe = String(q || '').replace(/'/g, "''").slice(0, 80);
  if (!safe) return { ok: true, value: [] };
  const filter = `startswith(displayName,'${safe}') or startswith(mail,'${safe}') or startswith(userPrincipalName,'${safe}')`;
  return graphList(token, `/users?$select=id,displayName,mail,userPrincipalName&$filter=${encodeURIComponent(filter)}&$top=20`, 'users');
}

export async function loadOrg(token, organization) {
  const [licenses, domains, health, issues] = await Promise.all([
    loadLicenses(token),
    loadDomains(token),
    graphList(token, '/admin/serviceAnnouncement/healthOverviews', 'health'),
    graphList(token, '/admin/serviceAnnouncement/issues?$top=15', 'messages'),
  ]);
  const exo = await runExo({ token: null, organization, mode: 'org' });
  // The Exchange token is passed separately by the caller when it exists. This function receives it as organization.token via the third concept:
  return { licenses, domains, health, issues, exo };
}

export async function loadExchangeOrg(exoToken, organization, identity = {}) {
  if (!exoToken) return notAuthorized('exchange', 'Exchange.Manage is a second token, not part of the Graph token.');
  return runExo({ token: exoToken, organization, mode: 'org', ...identity });
}

export function shapeExchange(exo) {
  if (!exo?.ok) return { denied: exo || notAuthorized('exchange') };
  const rules = cmd(exo, 'rules');
  const inbound = cmd(exo, 'inbound');
  const outbound = cmd(exo, 'outbound');
  const spamRule = cmd(exo, 'spamRule');
  const phishRule = cmd(exo, 'phishRule');
  const safeLinks = cmd(exo, 'safeLinksRule');
  const safeAttach = cmd(exo, 'safeAttachRule');
  const quarantine = cmd(exo, 'quarantine');
  const org = cmd(exo, 'org');
  const accepted = cmd(exo, 'accepted');
  const remote = cmd(exo, 'remote');
  const mapRule = row => ({
    name: row.Name || row.Identity || '',
    priority: row.Priority ?? null,
    state: row.State || 'Enabled',
    policy: row.Name,
    sentTo: row.SentTo || [],
    sentToMemberOf: row.SentToMemberOf || [],
    recipientDomainIs: row.RecipientDomainIs || [],
    exceptIfSentTo: row.ExceptIfSentTo || [],
    actions: [],
  });
  return {
    accepted: list(accepted),
    remote: remote.ok ? remote.value.map(r => ({ name: r.Name, domain: r.DomainName, autoForward: r.AutoForwardEnabled })) : remote,
    connectors: (inbound.ok || outbound.ok) ? [
      ...(inbound.ok ? inbound.value.map(c => ({ name: c.Name, direction: 'inbound', enabled: c.Enabled !== false, senderDomains: c.SenderDomains || [], tls: c.RequireTls ? 'required' : '' })) : []),
      ...(outbound.ok ? outbound.value.map(c => ({ name: c.Name, direction: 'outbound', enabled: c.Enabled !== false, recipientDomains: c.RecipientDomains || [], tls: c.TlsSettings || '' })) : []),
    ] : (inbound.ok === false ? inbound : outbound),
    transportRules: rules.ok ? rules.value.map(mapRule) : rules,
    antiSpam: spamRule.ok ? spamRule.value.map(mapRule) : spamRule,
    antiPhish: phishRule.ok ? phishRule.value.map(mapRule) : phishRule,
    safeLinks: safeLinks.ok ? safeLinks.value.map(mapRule) : safeLinks,
    safeAttachments: safeAttach.ok ? safeAttach.value.map(mapRule) : safeAttach,
    quarantine: quarantine.ok ? quarantine.value.map(q => ({ name: q.Name, priority: 0, state: 'Enabled', policy: q.Name, recipientDomainIs: [] })) : quarantine,
    config: org.ok ? {
      modernAuth: org.value[0]?.OAuth2ClientProfileEnabled !== false,
      smtpAuthDisabled: Boolean(org.value[0]?.SmtpClientAuthenticationDisabled),
      raw: true,
    } : org,
    defender: safeLinks.licensed === false ? false : true,
  };
}

export async function loadMailboxLive(graphToken, exoToken, organization, id, identity = {}, source = 'user') {
  // source: 'user' (Graph /users), 'group' (/groups) or 'contact' (/contacts). Exchange then says what it really is.
  // source 'exo': a recipient only Exchange Online knows (dynamic distribution list, mail-enabled public folder),
  // opened by its address. It has no Microsoft Entra object, so there is no Graph read and no group membership.
  if (source === 'exo') {
    if (!exoToken) return { ok: false, ...notAuthorized('exchange', 'This recipient exists only in Exchange Online, so it needs the Exchange Online sign-in.') };
    const exo = await runExo({ token: exoToken, organization, mode: 'mailbox', args: { identity: id }, ...identity });
    const member = { ok: false, authorized: true, label: 'Not available', message: 'This recipient exists only in Exchange Online, not in Microsoft Entra ID, so Ex360 cannot list the groups it belongs to.' };
    return { ok: true, mailbox: mailboxFromReads({ id, displayName: id, mail: id, proxyAddresses: [] }, member, exo, true) };
  }
  const path = source === 'group' ? 'groups' : source === 'contact' ? 'contacts' : 'users';
  const select = source === 'user' ? 'id,displayName,mail,userPrincipalName,proxyAddresses,assignedLicenses' : 'id,displayName,mail,proxyAddresses';
  const user = await graphGet(graphToken, `/${path}/${encodeURIComponent(id)}?$select=${select}`, source === 'user' ? 'users' : 'directory');
  if (!user.ok) return user;
  const member = await graphList(graphToken, `/${path}/${encodeURIComponent(id)}/memberOf?$select=id,displayName,groupTypes,mailEnabled,securityEnabled`, 'directory');
  let exo = null;
  if (exoToken) exo = await runExo({ token: exoToken, organization, mode: 'mailbox', args: { identity: user.json.mail || user.json.userPrincipalName }, ...identity });
  return { ok: true, mailbox: mailboxFromReads(user.json, member, exo, Boolean(exoToken)) };
}

// Turns the Graph user, its groups and the Exchange 'mailbox' mode output into the Mailbox pages' shape.
export function mailboxFromReads(userJson, member, exo, hasExoToken = true) {
  const user = { json: userJson };
  const exoToken = hasExoToken;
  const box = cmd(exo || { ok: false }, 'mailbox');
  const cas = cmd(exo || { ok: false }, 'cas');
  const stats = cmd(exo || { ok: false }, 'stats');
  const inbox = cmd(exo || { ok: false }, 'inbox');
  const full = cmd(exo || { ok: false }, 'full');
  const sendas = cmd(exo || { ok: false }, 'sendas');
  const userAuth = cmd(exo || { ok: false }, 'userAuth');
  const orgAuth = cmd(exo || { ok: false }, 'orgAuth');
  const grantedFull = cmd(exo || { ok: false }, 'grantedFull');
  const grantedSendAs = cmd(exo || { ok: false }, 'grantedSendAs');
  const grantedSendOnBehalf = cmd(exo || { ok: false }, 'grantedSendOnBehalf');
  const row = box.ok ? box.value[0] || {} : {};
  const casRow = cas.ok ? cas.value[0] || {} : {};
  const stat = stats.ok ? stats.value[0] || {} : {};
  const rec = cmd(exo || { ok: false }, 'recipient');
  const recRow = rec.ok ? rec.value[0] || {} : {};
  const kind = recipientType(recRow.RecipientTypeDetails || row.RecipientTypeDetails).kind;
  if (rec.ok && kind !== 'mailbox') return recipientFromReads(user.json, member, exo, recRow);
  const mailbox = {
    id: user.json.id,
    displayName: user.json.displayName,
    primary: user.json.mail || user.json.userPrincipalName,
    type: row.RecipientTypeDetails || 'User',
    kind: 'mailbox',
    typeLabel: recipientType(row.RecipientTypeDetails || 'User').label,
    size: asText(stat.TotalItemSize),
    quota: asText(row.ProhibitSendQuota),
    aliases: user.json.proxyAddresses || [],
    licenses: (user.json.assignedLicenses || []).map(l => l.skuId),
    memberOf: member.ok ? member.value.map(g => ({ id: g.id, name: g.displayName, kind: groupKindOf(g) })) : [],
    memberError: member.ok ? null : member,
    forwarding: { smtp: row.ForwardingSmtpAddress || '', deliverAndForward: Boolean(row.DeliverToMailboxAndForward) },
    inboxRules: inbox.ok ? inbox.value.map(r => ({ name: r.Name, enabled: r.Enabled !== false, description: r.Description || '' })) : [],
    inboxError: inbox.ok ? null : failure(inbox, 'Get-InboxRule'),
    fullAccess: full.ok ? full.value.filter(p => p.User && !SYSTEM_PRINCIPAL.test(asText(p.User))).map(p => ({ name: asText(p.User), rights: asList(p.AccessRights) })) : [],
    fullError: full.ok ? null : failure(full, 'Get-MailboxPermission'),
    sendAs: sendas.ok ? sendas.value.filter(p => p.Trustee && !SYSTEM_PRINCIPAL.test(asText(p.Trustee))).map(p => ({ name: asText(p.Trustee) })) : [],
    sendAsError: sendas.ok ? null : failure(sendas, 'Get-RecipientPermission'),
    sendOnBehalf: asList(row.GrantSendOnBehalfTo).map(name => ({ name })),
    sendOnBehalfError: box.ok ? null : failure(box, 'Get-Mailbox'),
    granted: {
      fullAccess: grantedFull.ok ? grantedFull.value.map(m => ({ name: asText(m.DisplayName), address: asText(m.PrimarySmtpAddress), rights: asList(m.AccessRights) })) : [],
      fullAccessError: grantedFull.ok ? null : failure(grantedFull, 'Get-MailboxPermission -User'),
      sendAs: grantedSendAs.ok ? grantedSendAs.value.map(m => ({ name: asText(m.Identity) })) : [],
      sendAsError: grantedSendAs.ok ? null : failure(grantedSendAs, 'Get-RecipientPermission -Trustee'),
      sendOnBehalf: grantedSendOnBehalf.ok ? grantedSendOnBehalf.value.map(m => ({ name: asText(m.DisplayName), address: asText(m.PrimarySmtpAddress) })) : [],
      sendOnBehalfError: grantedSendOnBehalf.ok ? null : failure(grantedSendOnBehalf, 'Get-Mailbox -Filter GrantSendOnBehalfTo'),
    },
    litigationHold: Boolean(row.LitigationHoldEnabled),
    retentionHold: Boolean(row.RetentionHoldEnabled),
    retentionPolicy: row.RetentionPolicy || '',
    authPolicy: (userAuth.ok ? asText(userAuth.value[0]?.AuthenticationPolicy) : '') || '',
    authPolicyError: userAuth.ok ? null : failure(userAuth, 'Get-User'),
    orgAuthPolicy: orgAuth.ok ? asText(orgAuth.value[0]?.DefaultAuthenticationPolicy) || '' : null,
    orgAuthPolicyError: orgAuth.ok || !(exo?.commands || []).some(c => c.name === 'orgAuth') ? null : failure(orgAuth, 'Get-OrganizationConfig'),
    cas: cas.ok ? {
      mapi: casRow.MAPIEnabled !== false,
      ews: casRow.EwsEnabled !== false,
      activeSync: casRow.ActiveSyncEnabled !== false,
      pop: Boolean(casRow.PopEnabled),
      imap: Boolean(casRow.ImapEnabled),
      smtp: Boolean(casRow.SmtpClientAuthenticationDisabled) === false,
    } : null,
    casError: cas.ok ? null : cas,
    exchange: box.ok ? null : (exoToken ? box : notAuthorized('exchange')),
  };
  return mailbox;
}

// A recipient that is not a mailbox: Microsoft 365 group, distribution or mail-enabled security group,
// mail contact or mail user. Only the reads that apply to its type were run.
export function recipientFromReads(graphJson, member, exo, recRow) {
  const type = recipientType(recRow.RecipientTypeDetails);
  const read = name => cmd(exo || { ok: false }, name);
  const group = read('group');
  const g = group.ok ? group.value[0] || {} : {};
  const members = read('members');
  const owners = read('owners');
  const sendas = read('sendas');
  const mailuser = read('mailuser');
  const stats = read('stats');
  const userAuth = read('userAuth');
  const has = name => (exo?.commands || []).some(c => c.name === name);
  const people = res => res.value.map(m => ({ name: asText(m.Name), address: asText(m.PrimarySmtpAddress), type: asText(m.RecipientTypeDetails) }));
  const onBehalf = type.kind === 'mailuser' ? (mailuser.ok ? mailuser.value[0]?.GrantSendOnBehalfTo : null) : g.GrantSendOnBehalfTo;
  return {
    id: graphJson.id,
    displayName: recRow.DisplayName || graphJson.displayName,
    primary: asText(recRow.PrimarySmtpAddress) || graphJson.mail || graphJson.userPrincipalName,
    type: type.type,
    kind: type.kind,
    typeLabel: type.label,
    size: stats.ok ? asText(stats.value[0]?.TotalItemSize) : '',
    quota: '',
    aliases: asList(recRow.EmailAddresses).length ? asList(recRow.EmailAddresses) : graphJson.proxyAddresses || [],
    externalAddress: asText(recRow.ExternalEmailAddress).replace(/^smtp:/i, ''),
    hidden: Boolean(recRow.HiddenFromAddressListsEnabled),
    licenses: (graphJson.assignedLicenses || []).map(l => l.skuId),
    memberOf: member.ok ? member.value.map(x => ({ id: x.id, name: x.displayName, kind: groupKindOf(x) })) : [],
    memberError: member.ok ? null : member,
    members: has('members') ? (members.ok ? people(members) : []) : null,
    membersError: has('members') && !members.ok ? failure(members, 'Reading the members') : null,
    owners: has('owners') ? (owners.ok ? people(owners) : []) : null,
    ownersError: has('owners') && !owners.ok ? failure(owners, 'Reading the owners') : null,
    group: group.ok ? {
      privacy: asText(g.AccessType),
      requireSenderAuth: g.RequireSenderAuthenticationEnabled !== false,
      acceptOnlyFrom: asList(g.AcceptMessagesOnlyFromSendersOrMembers),
      managedBy: asList(g.ManagedBy),
      memberJoin: asText(g.MemberJoinRestriction),
      memberDepart: asText(g.MemberDepartRestriction),
      recipientFilter: asText(g.RecipientFilter),
      subscribeNewMembers: g.AutoSubscribeNewMembers == null ? null : Boolean(g.AutoSubscribeNewMembers),
    } : null,
    groupError: has('group') && !group.ok ? failure(group, 'Reading the group') : null,
    forwarding: { smtp: asText(g.ForwardingAddress), deliverAndForward: Boolean(g.DeliverToMailboxAndForward) },
    inboxRules: [],
    inboxError: null,
    fullAccess: [],
    fullError: null,
    sendAs: sendas.ok ? sendas.value.filter(p => p.Trustee && !SYSTEM_PRINCIPAL.test(asText(p.Trustee))).map(p => ({ name: asText(p.Trustee) })) : [],
    sendAsError: has('sendas') && !sendas.ok ? failure(sendas, 'Get-RecipientPermission') : null,
    sendOnBehalf: asList(onBehalf).map(name => ({ name })),
    sendOnBehalfError: null,
    granted: { fullAccess: [], sendAs: [], sendOnBehalf: [] },
    litigationHold: false,
    retentionHold: false,
    retentionPolicy: '',
    authPolicy: (userAuth.ok ? asText(userAuth.value[0]?.AuthenticationPolicy) : '') || '',
    cas: null,
    casError: null,
    exchange: null,
  };
}

// Sign-in logs for one person. /auditLogs/signIns supports only $filter, $top and $skiptoken, and always
// returns newest first; adding $orderby makes Graph answer 400/500 "UnknownError" with an empty message.
// Filter by the Entra object id when we have it (the address shown on a mailbox is often not the UPN),
// and bound the window so Graph does not time out scanning the whole retention period.
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const SIGNIN_DAYS = 30;
export function signInsPath({ id = '', upn = '', top = 50 } = {}, now = Date.now()) {
  const since = new Date(now - SIGNIN_DAYS * 24 * 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const who = GUID.test(String(id))
    ? `userId eq '${String(id).toLowerCase()}'`
    : `userPrincipalName eq '${String(upn).toLowerCase().replace(/'/g, "''")}'`;
  const filter = encodeURIComponent(`${who} and createdDateTime ge ${since}`);
  return `/auditLogs/signIns?$filter=${filter}&$top=${top}`;
}

export async function loadSignIns(token, who) {
  const target = typeof who === 'string' ? { upn: who } : who || {};
  return graphList(token, signInsPath(target), 'signins', 1);
}

export async function loadMessageHeaders(token, user, internetMessageId) {
  const id = String(internetMessageId || '').replace(/'/g, "''");
  const filter = encodeURIComponent(`internetMessageId eq '${id}'`);
  const res = await graphGet(token, `/users/${encodeURIComponent(user)}/messages?$filter=${filter}&$select=internetMessageHeaders,subject,from,toRecipients&$top=1`, 'mail');
  if (!res.ok) return res;
  const message = res.json.value?.[0];
  if (!message) return { ok: false, message: 'No message with that Internet message ID was found in the mailbox.' };
  const headers = (message.internetMessageHeaders || []).map(h => `${h.name}: ${h.value}`).join('\n');
  return { ok: true, headers, subject: message.subject };
}

export function traceDenied(status, body) {
  return classifyStatus(status, body, 'trace');
}
