// The single-mailbox report: everything that affects one user's email, in plain words.
// One model feeds both the "Everything for one user" page and the PDF, so they always say the same thing.
// Pure: the server gathers the reads (server/report.mjs) and this file only explains them.
//
// Model: { title, subject, generatedAt, source, signedInAs, sections: [{ id, title, intro, blocks, portals }] }
// Blocks: facts { rows: [[label, value, note?]] } | table { columns, rows } | text { text, tone? }
//         | list { items: [{ text, tone? }] } | denied { label, message, permission, role, signIn }

import {
  arr, low, identityOf, PROTECTION, protectionFor, transportRulesFor, dlpFor, retentionFor, labelPoliciesFor,
  caseHoldsFor, decodeHolds, conditionalAccessFor,
} from './report-policy.js';
import { SERVICE_PLANS, skuDisplayName } from './licenses.js';
import { portalsFor, fillUser } from './portals.js';
import { notAuthorized } from './permissions.js';

export const REPORT_VERSION = 1;

const yesNo = v => (v === true || v === 'True' ? 'Yes' : v === false || v === 'False' ? 'No' : '—');
const onOff = v => (v === true || v === 'True' ? 'On' : v === false || v === 'False' ? 'Off' : '—');
const has = v => v != null && v !== '' && !(Array.isArray(v) && !v.length);
function text(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.map(text).filter(Boolean).join(', ');
  if (typeof v === 'object') return text(v.Value ?? v.DisplayName ?? v.Name ?? v.value ?? JSON.stringify(v));
  return String(v);
}
// "4.2 GB (4,509,715,660 bytes)" -> "4.2 GB"
const size = v => text(v).replace(/\s*\([\d,.\s]+bytes\)/i, '').trim();
const strip = html => String(html || '').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li)>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/[ \t]+/g, ' ').replace(/\n\s*/g, '\n').trim();
const clipText = (s, n = 400) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function formatTime(value, timeZone) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return text(value);
  try {
    return d.toLocaleString('en-US', { timeZone: timeZone || 'UTC', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  } catch {
    return d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  }
}

// A read result is { ok: true, value } or a refusal. Turn a refusal into a visible block, never into silence.
export function deniedBlock(result, what) {
  const r = result || notAuthorized('exchange');
  const notAuth = r.authorized === false || r.label === 'Not authorized';
  const unlicensed = r.licensed === false || r.label === 'License required';
  const signIn = notAuth ? (/Exchange\.Manage/.test(`${r.permission} ${r.message}`) ? 'exchange' : /ps\.compliance|ipps/i.test(`${r.permission}`) ? 'compliance' : /SecurityAlert|SecurityIncident|RecordsManagement|eDiscovery|InformationProtection/.test(`${r.permission}`) ? 'purview' : null) : null;
  return {
    type: 'denied',
    label: notAuth ? 'Not authorized' : unlicensed ? 'License required' : r.expired ? 'Sign in again' : 'Could not read',
    message: `${what ? `${what}: ` : ''}${r.message || 'The service did not return this data.'}`,
    permission: r.permission || null,
    role: r.role || null,
    signIn,
  };
}
const ok = r => Boolean(r && r.ok !== false && (Array.isArray(r.value) || r.json || r.ok === true));
const rows = r => (ok(r) ? arr(r.value ?? r.json?.value ?? r.json) : []);
const first = r => rows(r)[0] || null;

// Pull one named command out of a PowerShell bundle, keeping refusals as refusals.
export function command(bundle, name, kind = 'exchange') {
  if (!bundle) return notAuthorized(kind);
  if (bundle.ok === false && !bundle.commands) return bundle;
  const row = (bundle.commands || []).find(c => c.name === name);
  if (!row) return { ok: false, authorized: true, label: 'Could not read', message: `${name} was not returned.` };
  if (!row.ok) {
    const error = String(row.error || '');
    if (/not authorized|access denied|forbidden|does not have permission|isn't within your current write scope|UnAuthorized/i.test(error)) return { ...notAuthorized(kind), detail: error };
    if (/is not recognized|not licensed|Cmdlet not found|isn't available|not available/i.test(error)) return { ok: false, authorized: true, licensed: false, label: 'License required', message: `This read is not available in this tenant, usually because a license such as Microsoft Defender for Office 365 is missing. ${error}`.trim() };
    if (/couldn't be found|could not be found|ManagementObjectNotFound/i.test(error)) return { ok: true, value: [], missing: true };
    return { ok: false, authorized: true, label: 'Could not read', message: error };
  }
  return { ok: true, value: arr(row.value) };
}

function section(id, title, intro, blocks, portals = []) {
  return {
    id, title, intro,
    blocks: blocks.filter(Boolean),
    portals: portals.map(portalsFor).filter(Boolean).map(p => ({ title: p.title, links: p.links, powershell: p.powershell })),
  };
}
const facts = list => ({ type: 'facts', rows: list.filter(r => r && r[1] !== undefined).map(([label, value, note]) => [label, text(value) || '—', note || '']) });
// links (optional): one { kind, obj } per row for the object in the first column; the page turns it into a direct link
// (lib/object-links.js). The PDF ignores it.
const tableBlock = (columns, list, empty, links) => (list.length ? { type: 'table', columns, rows: list.map(r => r.map(c => text(c))), ...(links ? { links } : {}) } : { type: 'text', text: empty });
const para = (t, tone) => ({ type: 'text', text: t, tone: tone || null });
const items = (list, title) => ({ type: 'list', title: title || null, items: list.map(i => (typeof i === 'string' ? { text: i } : i)) });

// Plain words for the settings of the policy that applies. Each line is one thing a junior admin can repeat to a user.
const ACTION = {
  MoveToJmf: 'moved to the Junk Email folder', Quarantine: 'quarantined', Delete: 'deleted', AddXHeader: 'delivered with an X-header added',
  ModifySubject: 'delivered with the subject changed', Redirect: 'redirected to another address', NoAction: 'delivered with no action',
};
export function settingsWords(key, p) {
  if (!p) return [];
  const out = [];
  const act = v => ACTION[v] || text(v);
  if (key === 'antiSpam') {
    if (p.SpamAction) out.push(`Spam is ${act(p.SpamAction)}.`);
    if (p.HighConfidenceSpamAction) out.push(`High-confidence spam is ${act(p.HighConfidenceSpamAction)}.`);
    if (p.PhishSpamAction) out.push(`Phishing is ${act(p.PhishSpamAction)}.`);
    if (p.HighConfidencePhishAction) out.push(`High-confidence phishing is ${act(p.HighConfidencePhishAction)}.`);
    if (p.BulkSpamAction) out.push(`Bulk mail at or above level ${p.BulkThreshold ?? '?'} (1 to 9, lower is stricter) is ${act(p.BulkSpamAction)}.`);
    if (p.QuarantineRetentionPeriod) out.push(`Quarantined messages are kept ${p.QuarantineRetentionPeriod} days.`);
    const tags = [p.SpamQuarantineTag, p.HighConfidenceSpamQuarantineTag, p.PhishQuarantineTag, p.HighConfidencePhishQuarantineTag, p.BulkQuarantineTag].filter(Boolean);
    if (tags.length) out.push(`Quarantine policies used (what the user may do with quarantined mail): ${[...new Set(tags)].join(', ')}.`);
    if (p.SpamZapEnabled != null) out.push(`Zero-hour auto purge removes spam already delivered: ${onOff(p.SpamZapEnabled)}. For phishing: ${onOff(p.PhishZapEnabled)}.`);
    if (Number(p.AllowedSenderCount) > 0) out.push(`${p.AllowedSenderCount} allowed senders or domains skip spam filtering. Allowed lists are a common reason spam reaches a user.`);
    if (Number(p.BlockedSenderCount) > 0) out.push(`${p.BlockedSenderCount} senders or domains are always marked as spam.`);
  } else if (key === 'antiMalware') {
    out.push(`Common attachments filter (blocks risky file types): ${onOff(p.EnableFileFilter)}${p.FileTypeCount ? `, ${p.FileTypeCount} file types` : ''}.`);
    if (p.FileTypeAction) out.push(`A blocked file type is handled as: ${p.FileTypeAction === 'Reject' ? 'rejected with a bounce (NDR)' : 'quarantined'}.`);
    out.push(`Zero-hour auto purge for malware: ${onOff(p.ZapEnabled)}.`);
    if (p.QuarantineTag) out.push(`Quarantine policy: ${p.QuarantineTag}.`);
  } else if (key === 'antiPhish') {
    if (p.Enabled === false) out.push('The policy itself is turned off.');
    out.push(`Spoof intelligence: ${onOff(p.EnableSpoofIntelligence)}. Messages that fail it are ${p.AuthenticationFailAction === 'Quarantine' ? 'quarantined' : 'moved to Junk Email'}.`);
    if (p.HonorDmarcPolicy != null) out.push(`Honors the sender's DMARC reject or quarantine policy: ${yesNo(p.HonorDmarcPolicy)}.`);
    if (p.PhishThresholdLevel) out.push(`Phishing threshold ${p.PhishThresholdLevel} (1 standard to 4 most aggressive).`);
    if (p.EnableFirstContactSafetyTips != null) out.push(`First contact safety tip: ${onOff(p.EnableFirstContactSafetyTips)}. Question mark on unauthenticated senders: ${onOff(p.EnableUnauthenticatedSender)}. "via" tag: ${onOff(p.EnableViaTag)}.`);
    if (p.EnableMailboxIntelligence != null) out.push(`Defender impersonation protection: users ${onOff(p.EnableTargetedUserProtection)}, own domains ${onOff(p.EnableOrganizationDomainsProtection)}, custom domains ${onOff(p.EnableTargetedDomainsProtection)}, mailbox intelligence ${onOff(p.EnableMailboxIntelligence)} (protection ${onOff(p.EnableMailboxIntelligenceProtection)}).`);
  } else if (key === 'safeLinks') {
    out.push(`Links in email are checked when clicked: ${onOff(p.EnableSafeLinksForEmail)}. In Teams: ${onOff(p.EnableSafeLinksForTeams)}. In Office apps: ${onOff(p.EnableSafeLinksForOffice)}.`);
    if (p.ScanUrls != null) out.push(`Real-time scanning of suspicious links and files: ${onOff(p.ScanUrls)}. Wait for scanning before delivering: ${onOff(p.DeliverMessageAfterScan)}.`);
    if (p.EnableForInternalSenders != null) out.push(`Also applies to mail between people inside the organization: ${yesNo(p.EnableForInternalSenders)}.`);
    if (p.DisableUrlRewrite != null) out.push(`Links are rewritten in the message body: ${p.DisableUrlRewrite ? 'No' : 'Yes'}.`);
    if (p.AllowClickThrough != null) out.push(`The user may click through a warning page to a blocked site: ${yesNo(p.AllowClickThrough)}. Clicks are tracked: ${yesNo(p.TrackClicks)}.`);
  } else if (key === 'safeAttachments') {
    if (p.Enable === false) out.push('Safe Attachments scanning is turned off in this policy.');
    const action = { Block: 'held until it is scanned, and blocked if it is malicious', DynamicDelivery: 'delivered right away with placeholder attachments, which are swapped in after scanning', Allow: 'delivered, and only monitored (Allow)', Off: 'not scanned' }[p.Action] || text(p.Action);
    if (p.Action) out.push(`Mail with attachments is ${action}.`);
    if (p.Redirect) out.push(`Malicious attachments are also sent to ${p.RedirectAddress || 'a redirect address'}.`);
    if (p.QuarantineTag) out.push(`Quarantine policy: ${p.QuarantineTag}.`);
  } else if (key === 'outbound') {
    const mode = { Automatic: 'Automatic, which Microsoft treats as Off: automatic forwarding to outside addresses is blocked', On: 'On: automatic forwarding to outside addresses is allowed', Off: 'Off: automatic forwarding to outside addresses is blocked' }[p.AutoForwardingMode] || text(p.AutoForwardingMode);
    if (p.AutoForwardingMode) out.push(`Automatic external forwarding: ${mode}. A blocked forward bounces with 5.7.520.`);
    if (p.RecipientLimitPerDay != null) out.push(`Sending limits: ${p.RecipientLimitExternalPerHour || 'default'} external and ${p.RecipientLimitInternalPerHour || 'default'} internal recipients per hour, ${p.RecipientLimitPerDay || 'default'} per day (0 means the service default). Over the limit: ${p.ActionWhenThresholdReached === 'BlockUser' ? 'the user is blocked from sending' : p.ActionWhenThresholdReached === 'BlockUserForToday' ? 'the user is blocked until tomorrow' : 'an alert only'}.`);
  }
  return out;
}

// Plan names the user holds, and what each means for email.
function licenseRows(details, user, groups) {
  const groupName = id => groups.find(g => low(g.id) === low(id))?.displayName || 'a group';
  const states = arr(user?.licenseAssignmentStates);
  return details.map(d => {
    const how = states.filter(s => low(s.skuId) === low(d.skuId)).map(s => (s.assignedByGroup ? `group ${groupName(s.assignedByGroup)}` : 'directly'));
    const email = arr(d.servicePlans).filter(p => SERVICE_PLANS[p.servicePlanName] && !/disabled/i.test(p.provisioningStatus || '')).map(p => SERVICE_PLANS[p.servicePlanName].name);
    const off = arr(d.servicePlans).filter(p => SERVICE_PLANS[p.servicePlanName] && /disabled/i.test(p.provisioningStatus || '')).map(p => SERVICE_PLANS[p.servicePlanName].name);
    return [skuDisplayName(d.skuPartNumber), how.length ? [...new Set(how)].join(', ') : '—', [email.length ? email.join(', ') : 'No email plan', off.length ? `turned off: ${off.join(', ')}` : ''].filter(Boolean).join('; ')];
  });
}
export function userPlans(details) {
  const on = new Set();
  for (const d of details) for (const p of arr(d.servicePlans)) if (!/disabled/i.test(p.provisioningStatus || '')) on.add(p.servicePlanName);
  return {
    exchange: [...on].some(p => /^EXCHANGE_S_(STANDARD|ENTERPRISE|DESKLESS|ESSENTIALS|FOUNDATION)/.test(p)),
    exchangePlan2: on.has('EXCHANGE_S_ENTERPRISE'),
    archive: on.has('EXCHANGE_S_ENTERPRISE') || on.has('EXCHANGE_S_ARCHIVE_ADDON'),
    defender1: on.has('ATP_ENTERPRISE') || on.has('THREAT_INTELLIGENCE'),
    defender2: on.has('THREAT_INTELLIGENCE'),
    names: [...on],
  };
}

const PROTOCOLS = [
  ['OWAEnabled', 'Outlook on the web'], ['MAPIEnabled', 'Outlook for Windows and Mac (MAPI)'], ['EwsEnabled', 'Exchange Web Services (EWS)'],
  ['ActiveSyncEnabled', 'Exchange ActiveSync (phone mail apps)'], ['OutlookMobileEnabled', 'Outlook for iOS and Android'],
  ['PopEnabled', 'POP3'], ['ImapEnabled', 'IMAP4'],
];

// input: { source, generatedAt, timeZone, signedInAs, graph: { user, licenses, groups, signIns, ca, alerts }, exo, ipps }
export function buildMailboxReport(input) {
  const tz = input.timeZone || 'UTC';
  const when = v => formatTime(v, tz);
  const exo = input.exo;
  const ipps = input.ipps;
  const g = input.graph || {};
  const read = name => command(exo, name, name.startsWith('trace') ? 'trace' : 'exchange');
  const gov = name => command(ipps, name, 'ipps');

  const userRes = g.user || notAuthorized('users');
  const user = ok(userRes) ? (userRes.json || first(userRes) || {}) : null;
  const mbxRes = read('mailbox');
  const mailbox = first(mbxRes) || {};
  const groupRes = g.groups || notAuthorized('directory');
  const memberships = rows(groupRes).map(o => ({
    id: o.id, displayName: o.displayName, mail: o.mail, mailNickname: o.mailNickname, roleTemplateId: o.roleTemplateId,
    kind: /directoryRole/i.test(o['@odata.type'] || '') ? 'role' : 'group',
    type: /directoryRole/i.test(o['@odata.type'] || '') ? 'Admin role' : arr(o.groupTypes).includes('Unified') ? 'Microsoft 365 group' : o.mailEnabled && o.securityEnabled ? 'Mail-enabled security group' : o.mailEnabled ? 'Distribution list' : 'Security group',
  }));
  const groups = memberships.filter(m => m.kind === 'group');
  const who = identityOf({ user: user || {}, mailbox, groups: memberships });
  const licRes = g.licenses || notAuthorized('users');
  const licenseDetails = rows(licRes);
  const plans = userPlans(licenseDetails);
  const subject = {
    displayName: user?.displayName || mailbox.DisplayName || input.requested || '',
    address: who.primary || input.requested || '',
    id: user?.id || mailbox.ExternalDirectoryObjectId || '',
  };
  const glance = [];
  const note = (tone, t) => glance.push({ tone, text: t });
  const sections = [];

  // Account and licenses
  {
    const blocks = [];
    if (user) {
      blocks.push(facts([
        ['Display name', user.displayName], ['Sign-in name (UPN)', user.userPrincipalName], ['Primary email address', who.primary],
        ['Account enabled', yesNo(user.accountEnabled), user.accountEnabled === false ? 'The user cannot sign in. Mail still arrives in the mailbox.' : ''],
        ['Account type', user.userType || 'Member'], ['Job title', user.jobTitle], ['Department', user.department], ['Office', user.officeLocation],
        ['Usage location', user.usageLocation, user.usageLocation ? '' : 'A license cannot be assigned until a usage location is set.'],
        ['Synced from on-premises Active Directory', yesNo(Boolean(user.onPremisesSyncEnabled)), user.onPremisesSyncEnabled ? 'Change names, addresses and groups on-premises, not in the cloud.' : 'Cloud-only. Change it in Microsoft 365 or Entra.'],
        ['Created', when(user.createdDateTime)],
      ]));
      if (user.accountEnabled === false) note('high', 'The account is disabled, so the user cannot sign in to read mail.');
    } else blocks.push(deniedBlock(userRes, 'User account'));
    if (ok(licRes)) {
      blocks.push(tableBlock(['License', 'Assigned', 'What it gives this user for email'], licenseRows(licenseDetails, user, groups), 'No licenses are assigned to this user. A user mailbox needs an Exchange Online license within 30 days; shared, room and equipment mailboxes do not.', licenseDetails.map(d => ({ kind: 'sku', obj: { skuId: d.skuId } }))));
      if (/UserMailbox/i.test(mailbox.RecipientTypeDetails || '') && !plans.exchange) note('high', 'This is a user mailbox with no Exchange Online plan turned on in its licenses.');
      blocks.push(para(`Defender for Office 365 on this user: ${plans.defender2 ? 'Plan 2' : plans.defender1 ? 'Plan 1' : 'not licensed'}. Exchange Online: ${plans.exchangePlan2 ? 'Plan 2 (100 GB mailbox, archive, litigation hold)' : plans.exchange ? 'Plan 1 or Kiosk' : 'not licensed'}.`));
    } else blocks.push(deniedBlock(licRes, 'Licenses'));
    sections.push(section('account', 'Account and licenses', 'Who this is in Microsoft Entra ID and which licenses they hold. A license decides which protections Microsoft lets this user have.', blocks, ['user-account', 'licenses']));
  }

  // Mailbox
  {
    const blocks = [];
    if (ok(mbxRes)) {
      const stats = first(read('stats')) || {};
      const archive = first(read('archiveStats'));
      const type = text(mailbox.RecipientTypeDetails);
      blocks.push(facts([
        ['Mailbox type', { UserMailbox: 'User mailbox', SharedMailbox: 'Shared mailbox', RoomMailbox: 'Room mailbox', EquipmentMailbox: 'Equipment mailbox' }[type] || type],
        ['Size', size(stats.TotalItemSize), stats.ItemCount != null ? `${stats.ItemCount} items` : ''],
        ['Recoverable items (deleted)', size(stats.TotalDeletedItemSize)],
        ['Warning at', size(mailbox.IssueWarningQuota)], ['Stops sending at', size(mailbox.ProhibitSendQuota)], ['Stops sending and receiving at', size(mailbox.ProhibitSendReceiveQuota)],
        ['Archive mailbox', /active/i.test(text(mailbox.ArchiveStatus)) ? `On${archive ? `, ${size(archive.TotalItemSize)}` : ''}` : 'Off', mailbox.AutoExpandingArchiveEnabled ? 'Auto-expanding archive is on.' : ''],
        ['Largest message it can send / receive', `${size(mailbox.MaxSendSize) || '—'} / ${size(mailbox.MaxReceiveSize) || '—'}`],
        ['Recipient limit per message', mailbox.RecipientLimits],
        ['Hidden from the address book', yesNo(mailbox.HiddenFromAddressListsEnabled), mailbox.HiddenFromAddressListsEnabled ? 'Other people cannot find this mailbox in the Global Address List.' : ''],
        ['Mailbox auditing', onOff(mailbox.AuditEnabled)],
        ['Deleted items kept for', /^\d+\./.test(text(mailbox.RetainDeletedItemsFor)) ? `${text(mailbox.RetainDeletedItemsFor).split('.')[0]} days` : mailbox.RetainDeletedItemsFor, `Single item recovery: ${onOff(mailbox.SingleItemRecoveryEnabled)}.`],
        ['Copies of mail sent by delegates kept in this mailbox', `Send As: ${yesNo(mailbox.MessageCopyForSentAsEnabled)}. Send on behalf: ${yesNo(mailbox.MessageCopyForSendOnBehalfEnabled)}.`],
        ['Mail tip', strip(mailbox.MailTip) || 'None'],
        ['Address book policy', mailbox.AddressBookPolicy || 'None'], ['Sharing policy', mailbox.SharingPolicy], ['Role assignment policy', mailbox.RoleAssignmentPolicy],
        ['Created', when(mailbox.WhenMailboxCreated)], ['Last sign-in to the mailbox', when(stats.LastLogonTime) || '—', 'Exchange no longer updates this reliably. Use Recent sign-ins below.'],
      ]));
    } else blocks.push(deniedBlock(mbxRes, 'Mailbox'));
    sections.push(section('mailbox', 'Mailbox', 'The mailbox itself: type, size, limits and visibility.', blocks, ['mailboxes']));
  }

  // Addresses
  {
    const blocks = [];
    const list = ok(mbxRes) ? arr(mailbox.EmailAddresses) : arr(user?.proxyAddresses);
    if (list.length) {
      blocks.push(tableBlock(['Address', 'Kind'], list.map(a => {
        const s = String(a);
        const [prefix, ...rest] = s.split(':');
        return [rest.join(':') || s, prefix === 'SMTP' ? 'Primary (replies come from this one)' : /^smtp$/i.test(prefix) ? 'Alias (also receives mail)' : /^x500$/i.test(prefix) ? 'X500 (keeps old replies and meeting updates working after a move)' : /^sip$/i.test(prefix) ? 'SIP (Teams)' : prefix];
      }), 'No addresses returned.'));
    } else if (!ok(mbxRes) && !user) blocks.push(deniedBlock(mbxRes, 'Addresses'));
    else blocks.push(para('No addresses returned.'));
    sections.push(section('addresses', 'Email addresses', 'Every address that delivers to this mailbox.', blocks, ['mailboxes']));
  }

  // Delivery, forwarding, automatic replies
  const outbound = (() => { const r = read('outboundPolicy'); return ok(r) ? protectionFor(PROTECTION.find(t => t.key === 'outbound'), { outboundPolicy: rows(r), outboundRule: rows(read('outboundRule')) }, who) : null; })();
  {
    const blocks = [];
    if (ok(mbxRes)) {
      const fwd = text(mailbox.ForwardingSmtpAddress).replace(/^smtp:/i, '') || text(mailbox.ForwardingAddress);
      const external = fwd && who.domains.length && !who.domains.includes(low(fwd.split('@')[1] || ''));
      const autoMode = outbound?.policy?.AutoForwardingMode;
      blocks.push(facts([
        ['Forwarding', fwd || 'Off', fwd ? (mailbox.DeliverToMailboxAndForward ? 'A copy is also kept in this mailbox.' : 'No copy is kept in this mailbox.') : ''],
        ['Who may send to this mailbox', arr(mailbox.AcceptMessagesOnlyFrom).length || arr(mailbox.AcceptMessagesOnlyFromDLMembers).length ? `Only ${[...arr(mailbox.AcceptMessagesOnlyFrom), ...arr(mailbox.AcceptMessagesOnlyFromDLMembers)].join(', ')}` : 'Anyone'],
        ['Senders this mailbox rejects', [...arr(mailbox.RejectMessagesFrom), ...arr(mailbox.RejectMessagesFromDLMembers)].join(', ') || 'None'],
        ['Only accepts mail from authenticated (internal) senders', yesNo(mailbox.RequireSenderAuthenticationEnabled), mailbox.RequireSenderAuthenticationEnabled ? 'Mail from outside the organization bounces.' : ''],
      ]));
      if (fwd) note(external ? 'high' : 'medium', `Mail is forwarded to ${fwd}${mailbox.DeliverToMailboxAndForward ? ' and a copy is kept' : ' and no copy is kept'}.${external && autoMode && autoMode !== 'On' ? ' The outbound policy blocks automatic forwarding to outside addresses, so these forwards bounce with 5.7.520.' : ''}`);
      if (outbound?.policy) blocks.push(para(`Outbound policy for this user: ${outbound.policyName}. ${settingsWords('outbound', outbound.policy)[0] || ''}`));
    } else blocks.push(deniedBlock(mbxRes, 'Forwarding'));
    const remote = read('remote');
    if (ok(remote)) {
      const def = rows(remote).find(r => text(r.DomainName) === '*');
      if (def) blocks.push(para(`Remote domain "${def.Name}" (all outside domains): automatic forwarding ${def.AutoForwardEnabled === false ? 'is blocked' : 'is allowed'}, automatic replies to outside senders ${def.AutoReplyEnabled === false ? 'are not sent' : 'are allowed'}, out-of-office type ${def.AllowedOOFType || '—'}.`));
    } else blocks.push(deniedBlock(remote, 'Remote domains'));
    const ar = read('autoReply');
    if (ok(ar)) {
      const a = first(ar) || {};
      const state = text(a.AutoReplyState) || 'Disabled';
      blocks.push(facts([
        ['Automatic replies (out of office)', { Disabled: 'Off', Enabled: 'On', Scheduled: `Scheduled, ${when(a.StartTime)} to ${when(a.EndTime)}` }[state] || state],
        ['Sent to outside senders', state === 'Disabled' ? '—' : { None: 'No', Known: 'Only to contacts', All: 'Yes, everyone' }[a.ExternalAudience] || text(a.ExternalAudience)],
        ['Message to people inside the organization', state === 'Disabled' ? '—' : clipText(strip(a.InternalMessage)) || '(empty)'],
        ['Message to outside senders', state === 'Disabled' ? '—' : clipText(strip(a.ExternalMessage)) || '(empty)'],
      ]));
      if (state !== 'Disabled') note('info', `Automatic replies are ${state === 'Scheduled' ? 'scheduled' : 'on'}.`);
    } else blocks.push(deniedBlock(ar, 'Automatic replies'));
    sections.push(section('delivery', 'Delivery, forwarding and automatic replies', 'Where mail for this user goes, who may send to them, and what is sent back automatically.', blocks, ['forwarding', 'outbound-spam', 'remote-domains']));
  }

  // Inbox rules and junk
  {
    const blocks = [];
    const inbox = read('inbox');
    if (ok(inbox)) {
      const list = rows(inbox);
      blocks.push(tableBlock(['Rule', 'On', 'What it does'], list.map(r => [r.Name, yesNo(r.Enabled), strip(r.Description) || [r.ForwardTo && `Forward to ${text(r.ForwardTo)}`, r.RedirectTo && `Redirect to ${text(r.RedirectTo)}`, r.MoveToFolder && `Move to ${text(r.MoveToFolder)}`, r.DeleteMessage && 'Delete'].filter(Boolean).join('; ')]), 'This mailbox has no inbox rules.'));
      for (const r of list) {
        if (r.Enabled !== false && (has(r.ForwardTo) || has(r.ForwardAsAttachmentTo) || has(r.RedirectTo))) note('medium', `Inbox rule "${r.Name}" forwards or redirects mail. Rules like this are a common sign of a compromised account.`);
        else if (r.Enabled !== false && (r.DeleteMessage === true || /delete/i.test(String(r.Description || '')))) note('medium', `Inbox rule "${r.Name}" deletes mail. Check the user knows about it.`);
      }
    } else blocks.push(deniedBlock(inbox, 'Inbox rules'));
    const junk = read('junk');
    if (ok(junk)) {
      const j = first(junk) || {};
      blocks.push(facts([
        ['Junk Email filter in the mailbox', onOff(j.Enabled), j.Enabled === false ? 'Outlook does not move anything to Junk Email by itself. Service-side spam actions still apply.' : ''],
        ['Safe senders and domains', j.TrustedCount ?? '—', 'Mail from these skips the Junk Email folder.'],
        ['Blocked senders and domains', j.BlockedCount ?? '—'],
        ['Trust email from contacts', yesNo(j.ContactsTrusted)], ['Only trust safe lists', yesNo(j.TrustedListsOnly), j.TrustedListsOnly ? 'Everything not on the safe lists goes to Junk Email.' : ''],
      ]));
    } else blocks.push(deniedBlock(junk, 'Junk email settings'));
    sections.push(section('rules', 'Inbox rules and junk email', 'Rules the user (or someone with access) created inside the mailbox, and the mailbox Junk Email settings.', blocks, ['forwarding']));
  }

  // Delegation
  {
    const blocks = [];
    const full = read('full');
    const sendAs = read('sendas');
    if (ok(full)) {
      const list = rows(full).filter(p => p.User && !/NT AUTHORITY\\SELF|S-1-5-|^NT AUTHORITY/i.test(text(p.User)));
      blocks.push(tableBlock(['Who', 'Can do', ''], list.map(p => [p.User, text(p.AccessRights).replace('FullAccess', 'Full Access (open and read everything)'), p.Deny ? 'Denied' : '']), 'Nobody else has Full Access to this mailbox.'));
    } else blocks.push(deniedBlock(full, 'Full Access'));
    if (ok(sendAs)) {
      const list = rows(sendAs).filter(p => p.Trustee && !/NT AUTHORITY\\SELF/i.test(text(p.Trustee)));
      blocks.push(tableBlock(['Who can send as this user', 'Rights'], list.map(p => [p.Trustee, p.AccessRights]), 'Nobody else can send as this user.'));
    } else blocks.push(deniedBlock(sendAs, 'Send As'));
    if (ok(mbxRes)) blocks.push(facts([['Send on behalf', arr(mailbox.GrantSendOnBehalfTo).join(', ') || 'Nobody', 'Mail shows "sent on behalf of" this user.']]));
    sections.push(section('delegation', 'Who else can use this mailbox', 'Other people who can open this mailbox or send mail as this user.', blocks, ['delegation']));
  }

  // Groups and admin roles
  {
    const blocks = [];
    if (ok(groupRes)) {
      blocks.push(tableBlock(['Group', 'Kind', 'Email'], groups.map(m => [m.displayName, m.type, m.mail || '']), 'This user is not a member of any group.', groups.map(m => ({ kind: 'group', obj: { id: m.id } }))));
      const roles = memberships.filter(m => m.kind === 'role');
      blocks.push(tableBlock(['Admin role this user holds', 'Kind'], roles.map(r => [r.displayName, 'Microsoft Entra role']), 'This user holds no Microsoft Entra admin roles.', roles.map(r => ({ kind: 'entraRole', obj: { id: r.id } }))));
      if (roles.length) note('info', `This user holds ${roles.length} admin role${roles.length === 1 ? '' : 's'}: ${roles.map(r => r.displayName).join(', ')}.`);
      blocks.push(para('Groups include nested membership. Policies and rules below use these groups to decide whether they include this user.'));
    } else blocks.push(deniedBlock(groupRes, 'Group membership'));
    sections.push(section('groups', 'Groups and admin roles', 'Every group this user is in, directly or through another group.', blocks, ['groups', 'admin-roles']));
  }

  // Mail flow rules
  {
    const blocks = [];
    const rulesRes = read('rules');
    if (ok(rulesRes)) {
      const evaluated = transportRulesFor(rows(rulesRes), who);
      const acting = evaluated.filter(r => r.applies);
      const toUser = acting.filter(r => r.reach !== 'everyone');
      blocks.push(para(`${evaluated.length} mail flow rule${evaluated.length === 1 ? '' : 's'} in the organization. ${toUser.length} name this user, one of their groups or their domain. ${acting.length - toUser.length} can act on anyone's mail, depending on their other conditions. Every rule that matches a message runs, in priority order (0 first).`));
      blocks.push(tableBlock(['Priority', 'Rule', 'Acts on this user?', 'Why', 'What the rule does (Exchange wording)'], evaluated.map(r => [r.priority, r.name, r.applies ? ({ to: 'Yes, mail to them', from: 'Yes, mail they send', both: 'Yes, to and from', everyone: 'Can, on any message' }[r.reach]) : r.state === 'Disabled' ? 'No (turned off)' : /audit/i.test(r.mode) ? 'Test mode only' : 'No', r.why, r.description || '—']), 'The organization has no mail flow rules.'));
      if (toUser.length) note('info', `Mail flow rules that name this user, their groups or their domain: ${toUser.map(r => `"${r.name}"`).join(', ')}.`);
    } else blocks.push(deniedBlock(rulesRes, 'Mail flow rules'));
    sections.push(section('transport', 'Mail flow rules', 'Organization-wide rules (transport rules) that can change, redirect, block or stamp this user\'s mail.', blocks, ['transport-rules']));
  }

  // Email protection
  const protections = {};
  {
    const blocks = [];
    const data = {};
    const failed = [];
    for (const name of ['presetEop', 'presetAtp', 'builtIn', 'spamRule', 'spamPolicy', 'malwareRule', 'malwarePolicy', 'phishRule', 'phishPolicy', 'safeLinksRule', 'safeLinksPolicy', 'safeAttachRule', 'safeAttachPolicy', 'outboundRule', 'outboundPolicy']) {
      const r = read(name);
      if (ok(r)) data[name] = rows(r); else failed.push([name, r]);
    }
    const anyRead = Object.keys(data).length > 0;
    if (!anyRead) blocks.push(deniedBlock(failed[0]?.[1], 'Email protection policies'));
    else {
      const summary = [];
      for (const type of PROTECTION) {
        const policyFailed = failed.find(([n]) => n === type.policies);
        if (policyFailed && !data[type.rules]) {
          summary.push([type.label, policyFailed[1].label || 'Could not read', policyFailed[1].message || '']);
          protections[type.key] = { unavailable: true, block: deniedBlock(policyFailed[1], type.label) };
          continue;
        }
        const result = protectionFor(type, data, who);
        protections[type.key] = result;
        let licence = '';
        if (type.defender && result.applies && ok(licRes) && !plans.defender1) licence = ' This user has no Defender for Office 365 license. Microsoft requires one for every user this protects.';
        summary.push([type.label, result.applies || 'Nothing applies', `${result.why}${licence}`]);
      }
      blocks.push({ type: 'table', columns: ['Protection', 'Policy that applies', 'Why this one'], rows: summary.map(r => r.map(text)) });
      for (const type of PROTECTION) {
        const r = protections[type.key];
        if (!r || r.unavailable) { if (r?.block) blocks.push(r.block); continue; }
        const words = settingsWords(type.key, r.policy);
        if (r.applies) blocks.push(items(words.length ? words : [r.policy ? 'No settings were returned for this policy.' : 'The policy settings were not returned, so only its name is known.'], `${type.label}: ${r.policyName}`));
        if (r.checked?.length) blocks.push(items(r.checked.map(t => ({ text: t, tone: 'muted' })), `${type.label}: also checked`));
      }
      const sl = protections.safeLinks;
      const sa = protections.safeAttachments;
      note(sl?.applies ? 'ok' : 'medium', `Safe Links: ${sl?.applies ? `on, from ${sl.applies}` : sl?.unavailable ? 'could not be read' : 'does not protect this user'}. Safe Attachments: ${sa?.applies ? `on, from ${sa.applies}` : sa?.unavailable ? 'could not be read' : 'does not protect this user'}.`);
      if ((sl?.applies || sa?.applies) && ok(licRes) && !plans.defender1) note('medium', 'Safe Links or Safe Attachments covers this user, but the user has no Defender for Office 365 license assigned.');
      const spam = protections.antiSpam;
      if (spam?.applies) note('info', `Anti-spam: ${spam.applies}. Anti-phishing: ${protections.antiPhish?.applies || '—'}.`);
      for (const [name, r] of failed.filter(([n]) => !/Policy$/.test(n) && !data[n.replace(/Rule$/, 'Policy')])) if (!['presetEop', 'presetAtp', 'builtIn'].includes(name)) blocks.push(deniedBlock(r, name));
      for (const [name, r] of failed.filter(([n]) => ['presetEop', 'presetAtp', 'builtIn'].includes(n))) blocks.push(deniedBlock(r, { presetEop: 'Preset policies (Exchange Online Protection)', presetAtp: 'Preset policies (Defender for Office 365)', builtIn: 'Built-in protection' }[name]));
    }
    const ext = read('externalTag');
    if (ok(ext)) blocks.push(para(`"External" tag on mail from outside the organization in Outlook: ${onOff(first(ext)?.Enabled)}.`));
    sections.push(section('protection', 'Email protection', 'Which anti-spam, anti-malware, anti-phishing, Safe Links, Safe Attachments and outbound policy protects this user, and what each one does. Only one policy of each kind applies, in this order: Strict preset, Standard preset, custom policies by priority, Built-in protection, then the default.', blocks, ['preset-policies', 'anti-spam', 'anti-malware', 'anti-phish', 'safe-links', 'safe-attachments', 'quarantine']));
  }

  // Connectors and domain
  {
    const blocks = [];
    const accepted = read('accepted');
    const dkim = read('dkim');
    const inbound = read('inbound');
    const outboundC = read('outbound');
    if (ok(accepted)) {
      const d = rows(accepted).find(a => low(a.DomainName) === who.primaryDomain);
      blocks.push(facts([['This user\'s email domain', who.primaryDomain || '—', d ? `${d.DomainType === 'Authoritative' ? 'Authoritative: every mailbox for this domain is in Exchange Online' : d.DomainType === 'InternalRelay' ? 'Internal relay: unknown addresses are sent on to another system' : text(d.DomainType)}.` : 'Not an accepted domain of this organization.']]));
    } else blocks.push(deniedBlock(accepted, 'Accepted domains'));
    if (ok(dkim)) {
      const d = rows(dkim).find(a => low(a.Domain) === who.primaryDomain);
      blocks.push(facts([['DKIM signing for mail this user sends', d ? `${onOff(d.Enabled)}${d.Status ? ` (${d.Status})` : ''}` : 'Not configured for this domain', d?.Enabled ? '' : 'Without DKIM, receivers that enforce DMARC may reject or junk this user\'s mail. Check Domains and DNS.']]));
    } else blocks.push(deniedBlock(dkim, 'DKIM'));
    const conn = [];
    if (ok(inbound)) for (const c of rows(inbound)) conn.push([c.Name, 'Inbound', yesNo(c.Enabled !== false), arr(c.SenderDomains).map(d => String(d).replace(/^smtp:/i, '').replace(/;\d+$/, '')).join(', ') || 'Any', c.RequireTls ? 'TLS required' : '']);
    else blocks.push(deniedBlock(inbound, 'Inbound connectors'));
    if (ok(outboundC)) for (const c of rows(outboundC)) {
      const domains = arr(c.RecipientDomains).map(low);
      const scoped = c.IsTransportRuleScoped ? 'only when a mail flow rule sends mail through it' : domains.length ? domains.join(', ') : 'All outside domains';
      conn.push([c.Name, 'Outbound', yesNo(c.Enabled !== false), scoped, text(c.TlsSettings)]);
      if (c.Enabled !== false && !c.IsTransportRuleScoped && (!domains.length || domains.includes('*'))) note('info', `Outbound connector "${c.Name}" routes all of this user's mail to outside domains through ${arr(c.SmartHosts).join(', ') || 'a smart host'}.`);
    }
    else blocks.push(deniedBlock(outboundC, 'Outbound connectors'));
    blocks.push(tableBlock(['Connector', 'Direction', 'On', 'Domains', 'Security'], conn, 'No connectors. Mail goes straight between Exchange Online and the internet.'));
    sections.push(section('connectors', 'Connectors and domain', 'How this user\'s mail enters and leaves Exchange Online, and whether it is signed.', blocks, ['connectors', 'accepted-domains', 'dkim', 'spf-dmarc']));
  }

  // Client access
  {
    const blocks = [];
    const cas = read('cas');
    const org = first(read('org')) || {};
    const transport = read('transport');
    const transportRow = first(transport) || {};
    if (ok(cas)) {
      const c = first(cas) || {};
      const list = PROTOCOLS.filter(([k]) => c[k] !== undefined).map(([k, label]) => [label, c[k] === false ? 'Blocked' : 'Allowed']);
      const smtp = c.SmtpClientAuthenticationDisabled;
      const orgSmtpOff = ok(transport) ? Boolean(transportRow.SmtpClientAuthenticationDisabled) : null;
      const effective = smtp === true ? 'Blocked for this mailbox' : smtp === false ? 'Allowed for this mailbox (overrides the organization)' : orgSmtpOff == null ? 'Follows the organization setting (not readable)' : `Follows the organization: ${orgSmtpOff ? 'blocked' : 'allowed'}`;
      list.push(['Authenticated SMTP (printers, scripts, older apps)', effective]);
      blocks.push(tableBlock(['How the user connects', 'Status'], list, ''));
      for (const [k, label] of PROTOCOLS) if (c[k] === false && ['OWAEnabled', 'MAPIEnabled', 'ActiveSyncEnabled', 'OutlookMobileEnabled'].includes(k)) note('medium', `${label} is blocked for this mailbox.`);
      if (c.PopEnabled || c.ImapEnabled) note('low', `${[c.PopEnabled && 'POP', c.ImapEnabled && 'IMAP'].filter(Boolean).join(' and ')} ${c.PopEnabled && c.ImapEnabled ? 'are' : 'is'} allowed. Turn off what the user does not need.`);
      blocks.push(facts([
        ['Outlook on the web policy', c.OwaMailboxPolicy || 'Default'],
        ['Mobile device policy', c.ActiveSyncMailboxPolicy || 'Default'],
        ['Authentication policy', (first(read('userAuth')) || {}).AuthenticationPolicy || (org.DefaultAuthenticationPolicy ? `${org.DefaultAuthenticationPolicy} (organization default)` : '') || 'None (the organization has no default)'],
        ['Modern authentication for Outlook (organization)', ok(read('org')) ? onOff(org.OAuth2ClientProfileEnabled !== false) : '—'],
      ]));
    } else blocks.push(deniedBlock(cas, 'Client access'));
    const devices = read('devices');
    if (ok(devices)) blocks.push(tableBlock(['Phone or tablet', 'App', 'Access', 'First sync'], rows(devices).map(d => [`${text(d.FriendlyName) || text(d.DeviceModel)} (${text(d.DeviceOS)})`, d.ClientType, d.DeviceAccessState, when(d.FirstSyncTime)]), 'No mobile devices have synced with this mailbox.'));
    else blocks.push(deniedBlock(devices, 'Mobile devices'));
    sections.push(section('access', 'How the user connects', 'Which apps and protocols may open this mailbox, and the policies that shape them.', blocks, ['auth-policies', 'owa-mobile']));
  }

  // Retention, holds and governance
  {
    const blocks = [];
    const retention = rows(read('retention'));
    const tags = rows(read('retentionTags'));
    if (ok(mbxRes)) {
      const mrm = retention.find(r => low(r.Name) === low(mailbox.RetentionPolicy));
      const tagRows = arr(mrm?.RetentionPolicyTagLinks).map(name => {
        const t = tags.find(x => low(x.Name) === low(name));
        if (!t) return [name, '', ''];
        const days = text(t.AgeLimitForRetention).split('.')[0];
        return [t.Name, { All: 'Whole mailbox (default)', DeletedItems: 'Deleted Items', JunkEmail: 'Junk Email', Personal: 'Personal tag the user can choose', RecoverableItems: 'Recoverable Items', Inbox: 'Inbox', SentItems: 'Sent Items' }[t.Type] || text(t.Type), t.RetentionEnabled === false ? 'Off' : `${{ MoveToDeletedItems: 'Move to Deleted Items', DeleteAndAllowRecovery: 'Delete (recoverable)', PermanentlyDelete: 'Delete permanently', MoveToArchive: 'Move to archive', MarkAsPastRetentionLimit: 'Mark as past limit' }[t.RetentionAction] || text(t.RetentionAction)} after ${days || '?'} days`];
      });
      blocks.push(facts([
        ['Messaging records management (MRM) policy', mailbox.RetentionPolicy || 'None', 'Moves or deletes old items on a schedule.'],
        ['Retention hold', onOff(mailbox.RetentionHoldEnabled), mailbox.RetentionHoldEnabled ? 'MRM is paused, so nothing is moved or deleted by it.' : ''],
        ['Litigation hold', onOff(mailbox.LitigationHoldEnabled), mailbox.LitigationHoldEnabled ? `Everything is kept${mailbox.LitigationHoldDuration && !/unlimited/i.test(text(mailbox.LitigationHoldDuration)) ? ` for ${text(mailbox.LitigationHoldDuration)} days` : ' indefinitely'}, even if the user deletes it. Since ${when(mailbox.LitigationHoldDate) || '—'}${mailbox.LitigationHoldOwner ? ` by ${mailbox.LitigationHoldOwner}` : ''}.` : ''],
        ['Retention label hold', yesNo(mailbox.ComplianceTagHoldApplied), mailbox.ComplianceTagHoldApplied ? 'Some items have a retention label that keeps them.' : ''],
        ['Delay hold', yesNo(mailbox.DelayHoldApplied), mailbox.DelayHoldApplied ? 'A hold was removed in the last 30 days; Microsoft keeps content a little longer.' : ''],
      ]));
      if (tagRows.length) blocks.push(tableBlock(['Retention tag', 'Applies to', 'Action'], tagRows, ''));
      if (mailbox.LitigationHoldEnabled) note('info', 'Litigation hold is on. Nothing the user deletes is permanently removed.');
    } else blocks.push(deniedBlock(mbxRes, 'Retention'));
    // Purview
    const dlpRes = gov('dlp');
    const retRes = gov('retention');
    const holdsRes = gov('holds');
    const labelsRes = gov('labelPolicies');
    const retentionRows = ok(retRes) ? retentionFor(rows(retRes), rows(gov('retentionRules')), who) : [];
    const holdRows = ok(holdsRes) ? caseHoldsFor(rows(holdsRes), rows(gov('cases')), who) : [];
    const orgHolds = arr((first(read('org')) || {}).InPlaceHolds);
    const decoded = decodeHolds([...arr(mailbox.InPlaceHolds), ...orgHolds.filter(h => !arr(mailbox.InPlaceHolds).includes(`-${h}`))], { retention: retentionRows, holds: holdRows });
    if (ok(mbxRes)) blocks.push(tableBlock(['Hold on this mailbox', 'What it is'], decoded.map(h => [h.name || h.value, h.words]), 'No Purview or eDiscovery holds are recorded on this mailbox.'));
    if (ok(retRes)) blocks.push(tableBlock(['Purview retention policy', 'Covers this user?', 'Why', 'What it does'], retentionRows.map(r => [r.name, r.applies ? 'Yes' : 'No', r.why, r.effect || '—']), 'No Purview retention policies in this organization.'));
    else blocks.push(deniedBlock(retRes, 'Purview retention policies'));
    if (ok(holdsRes)) blocks.push(tableBlock(['eDiscovery hold', 'Case', 'Holds this mailbox?', 'Why'], holdRows.map(h => [h.name, h.case || '—', h.applies ? 'Yes' : 'No', h.why]), 'No eDiscovery case holds in this organization.'));
    else blocks.push(deniedBlock(holdsRes, 'eDiscovery holds'));
    if (ok(dlpRes)) {
      const list = dlpFor(rows(dlpRes), who);
      blocks.push(tableBlock(['DLP policy', 'Covers this user?', 'Mode', 'Why'], list.map(d => [d.name, d.inScope ? (d.applies ? 'Yes' : 'In scope, but off') : 'No', d.mode, d.why]), 'No data loss prevention policies cover Exchange in this organization.'));
      const enforced = list.filter(d => d.applies && !/test/i.test(d.mode));
      if (enforced.length) note('info', `DLP policies enforced on mail this user sends: ${enforced.map(d => `"${d.name}"`).join(', ')}.`);
    } else blocks.push(deniedBlock(dlpRes, 'Data loss prevention (DLP)'));
    if (ok(labelsRes)) {
      const list = labelPoliciesFor(rows(labelsRes), who);
      blocks.push(tableBlock(['Sensitivity label policy', 'Published to this user?', 'Labels', 'Why'], list.map(l => [l.name, l.applies ? 'Yes' : 'No', l.labels.join(', ') || '—', l.why]), 'No sensitivity label policies.'));
    } else blocks.push(deniedBlock(labelsRes, 'Sensitivity label policies'));
    const org = read('org');
    if (ok(org)) blocks.push(para(`Organization auditing: ${(first(org) || {}).AuditDisabled ? 'turned OFF for the whole organization, so mailbox actions are not logged' : 'on, so mailbox actions are logged'}.`));
    sections.push(section('governance', 'Retention, holds and governance', 'What keeps, deletes, checks or labels this user\'s mail: Exchange retention, holds, and Microsoft Purview retention, eDiscovery, DLP and sensitivity labels.', blocks, ['retention', 'retention-purview', 'ediscovery', 'dlp', 'labels', 'audit']));
  }

  // Conditional Access
  {
    const blocks = [];
    const ca = g.ca || notAuthorized('policy');
    if (ok(ca)) {
      const list = conditionalAccessFor(rows(ca), who, subject.id);
      const relevant = list.filter(p => p.inScope);
      blocks.push(tableBlock(['Policy', 'State', 'What it requires', 'Why it covers this user'], relevant.map(p => [p.name, p.state, p.effect || '—', p.why]), 'No Conditional Access policy covers Exchange Online for this user.', relevant.map(p => ({ kind: 'caPolicy', obj: { id: p.id } }))));
      const others = list.filter(p => !p.inScope);
      if (others.length) blocks.push(items(others.map(p => ({ text: `${p.name}: ${p.why}`, tone: 'muted' })), 'Policies that do not cover this user for Exchange'));
      if (relevant.some(p => p.applies)) note('info', `Conditional Access on Exchange for this user: ${relevant.filter(p => p.applies).map(p => `"${p.name}"`).join(', ')}.`);
    } else blocks.push(deniedBlock(ca, 'Conditional Access'));
    sections.push(section('ca', 'Conditional Access', 'Sign-in rules in Microsoft Entra ID that decide when this user may open Exchange Online.', blocks, ['conditional-access']));
  }

  // Sign-ins
  {
    const blocks = [];
    const s = g.signIns || notAuthorized('signins');
    if (ok(s)) {
      const list = rows(s).slice(0, 15);
      blocks.push(tableBlock(['When', 'App', 'Client', 'Result', 'Where from'], list.map(r => [when(r.createdDateTime || r.time), r.appDisplayName || r.app, r.clientAppUsed || '', r.status?.errorCode === 0 || r.status === 'Success' ? 'Success' : `Failed${r.status?.failureReason ? `: ${r.status.failureReason}` : ''}`, [r.ipAddress || r.ip, r.location?.city, r.location?.countryOrRegion].filter(Boolean).join(', ')]), 'No sign-ins in the period Microsoft keeps.', list.map(r => ({ kind: 'signIn', obj: { id: r.id } }))));
      const failed = list.filter(r => r.status?.errorCode && r.status.errorCode !== 0).length;
      if (failed >= 3) note('medium', `${failed} of the last ${list.length} sign-ins failed.`);
    } else blocks.push(deniedBlock(s, 'Sign-in logs'));
    sections.push(section('signins', 'Recent sign-ins', 'The latest sign-ins by this user, from Microsoft Entra ID.', blocks, ['signins']));
  }

  // Message trace
  {
    const blocks = [];
    const tin = read('traceIn');
    const tout = read('traceOut');
    const map = r => [when(r.Received || r.time), r.SenderAddress || r.sender, r.RecipientAddress || r.recipient, r.Subject || r.subject, r.Status || r.status];
    if (ok(tin)) blocks.push(tableBlock(['Received', 'From', 'To', 'Subject', 'Status'], rows(tin).map(map), 'No mail to this user in the last 10 days.'));
    else blocks.push(deniedBlock(tin, 'Mail received'));
    if (ok(tout)) blocks.push(tableBlock(['Sent', 'From', 'To', 'Subject', 'Status'], rows(tout).map(map), 'No mail from this user in the last 10 days.'));
    else blocks.push(deniedBlock(tout, 'Mail sent'));
    const bad = [...rows(tin), ...rows(tout)].filter(r => /fail|quarantin|filtered/i.test(text(r.Status || r.status)));
    if (bad.length) note('medium', `${bad.length} message${bad.length === 1 ? '' : 's'} in the last 10 days ${bad.length === 1 ? 'was' : 'were'} failed, filtered as spam or quarantined. Open Message hops to see why.`);
    sections.push(section('trace', 'Recent mail', 'Up to 25 messages received and 25 sent in the last 10 days, from message trace.', blocks, ['message-trace']));
  }

  // Alerts
  {
    const blocks = [];
    const a = g.alerts || notAuthorized('alerts');
    if (ok(a)) {
      const list = rows(a);
      blocks.push(tableBlock(['Alert', 'Severity', 'Status', 'When'], list.map(r => [r.title, r.severity, r.status, when(r.createdDateTime)]), 'No Defender alerts mention this user.', list.map(r => ({ kind: 'alert', obj: { id: r.id } }))));
      if (list.some(r => /high/i.test(r.severity || '') && !/resolved/i.test(r.status || ''))) note('high', 'There is an open high-severity Defender alert for this user.');
    } else blocks.push(deniedBlock(a, 'Defender alerts'));
    sections.push(section('alerts', 'Security alerts', 'Microsoft Defender XDR alerts that name this user.', blocks, ['xdr']));
  }

  // Not covered
  sections.push(section('limits', 'What this report does not cover', 'So nobody reads silence as "fine".', [items([
    'Multifactor authentication methods. Reading them needs UserAuthenticationMethod.Read.All, which Ex360 does not ask for.',
    'The Outlook app on the user\'s PC (version, add-ins, profile). Run the Outlook on this PC collector for that.',
    'The contents of the mailbox. Ex360 never reads message bodies for this report.',
    'Teams, OneDrive and SharePoint settings.',
    'Mail flow rule conditions other than who sends and receives (for example subject words or attachment types). The Exchange wording of each rule is shown so you can judge them.',
  ])]));

  if (!glance.length) note('ok', 'Nothing on this user stands out. Forwarding is off, no inbox rule forwards or deletes, and the account is enabled.');
  const order = { high: 0, medium: 1, low: 2, info: 3, ok: 4 };
  glance.sort((a, b) => order[a.tone] - order[b.tone]);
  const deniedCount = sections.reduce((n, s) => n + s.blocks.filter(b => b.type === 'denied').length, 0);
  const lead = [items(glance.map(i => ({ text: i.text, tone: i.tone })))];
  if (deniedCount) lead.push({ type: 'text', tone: 'warn', text: `${deniedCount} part${deniedCount === 1 ? '' : 's'} of this report could not be read with your permissions. Each one says Not authorized (or why it failed) where it would have been, with the permission or role it needs.` });
  sections.unshift(section('glance', 'At a glance', 'The things most likely to explain this user\'s email experience, most important first.', lead));

  return {
    version: REPORT_VERSION,
    title: `Mailbox report: ${subject.displayName || subject.address}`,
    subject,
    source: input.source || 'live',
    generatedAt: input.generatedAt || new Date().toISOString(),
    generatedText: formatTime(input.generatedAt || new Date().toISOString(), tz),
    timeZone: tz,
    signedInAs: input.signedInAs || '',
    sections: sections.map(s => ({ ...s, portals: s.portals.map(p => ({ ...p, powershell: fillUser(p.powershell, subject.address) })) })),
  };
}
