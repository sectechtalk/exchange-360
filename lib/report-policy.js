// Which policy, rule and governance setting acts on one user, and why, from the raw read-only cmdlet output.
// Pure functions. The single-mailbox report (lib/report.js) turns these results into plain sentences.
//
// Order Microsoft documents for email protection (Learn: "Order and precedence of email protection"):
//   1. Strict preset security policy  2. Standard preset security policy  3. Custom policies, lowest priority number first
//   4. Built-in protection preset (Safe Links and Safe Attachments only)  5. The default policy.
// The first policy that includes the user wins, and the others are not applied to that user.
// Inside one rule, different condition types must all be true (AND). Values inside one condition are OR.
// Any exception that is true excludes the user.

export const arr = value => (value == null || value === '' ? [] : Array.isArray(value) ? value : [value]);
export const low = value => String(value ?? '').trim().toLowerCase();
const cleanAddress = value => low(value).replace(/^(smtp|sip|x500|spo|eum):/, '');

// Everything a rule could use to name this user or one of their groups.
export function identityOf({ user = {}, mailbox = {}, groups = [] } = {}) {
  const addresses = [...new Set([
    user.mail, user.userPrincipalName, mailbox.PrimarySmtpAddress, mailbox.UserPrincipalName,
    ...arr(user.proxyAddresses).filter(a => /^smtp:/i.test(a)),
    ...arr(mailbox.EmailAddresses).filter(a => /^smtp:/i.test(a)),
  ].filter(Boolean).map(cleanAddress))];
  const names = new Set([
    ...addresses, user.id, user.displayName, user.mailNickname, mailbox.Name, mailbox.Alias, mailbox.DisplayName,
    mailbox.ExternalDirectoryObjectId, mailbox.Guid,
  ].filter(Boolean).map(low));
  const groupNames = new Map();
  for (const g of groups) {
    const label = g.displayName || g.mail || g.id;
    for (const v of [g.id, g.displayName, g.mail, g.mailNickname]) if (v) groupNames.set(low(v), label);
  }
  const domains = [...new Set(addresses.map(a => a.split('@')[1]).filter(Boolean))];
  const primary = cleanAddress(mailbox.PrimarySmtpAddress || user.mail || user.userPrincipalName || '');
  return { addresses, names, groupNames, domains, primary, primaryDomain: primary.split('@')[1] || '', roles: groups.filter(g => g.kind === 'role') };
}

const FIELDS = {
  recipient: { people: 'SentTo', groups: 'SentToMemberOf', domains: 'RecipientDomainIs', noun: 'recipients' },
  sender: { people: 'From', groups: 'FromMemberOf', domains: 'SenderDomainIs', noun: 'senders' },
};

function hitPeople(list, who) { return arr(list).find(v => who.names.has(low(v)) || who.names.has(cleanAddress(v))); }
function hitGroups(list, who) { const v = arr(list).find(item => who.groupNames.has(low(item))); return v ? who.groupNames.get(low(v)) : null; }
function hitDomains(list, who) { return arr(list).map(low).find(d => who.domains.includes(d.replace(/^\*\./, ''))); }

// Does one side (recipient or sender) of a rule include this user? Returns { scoped, inScope, excluded, why }.
export function scopeMatch(rule, who, side = 'recipient') {
  const f = FIELDS[side];
  const people = arr(rule[f.people]);
  const groupList = arr(rule[f.groups]);
  const domainList = arr(rule[f.domains]);
  const exPerson = hitPeople(rule[`ExceptIf${f.people}`], who);
  const exGroup = hitGroups(rule[`ExceptIf${f.groups}`], who);
  const exDomain = hitDomains(rule[`ExceptIf${f.domains}`], who);
  if (exPerson) return { scoped: true, inScope: false, excluded: true, why: `This user is named as an exception (${exPerson}).` };
  if (exGroup) return { scoped: true, inScope: false, excluded: true, why: `This user is excluded because they are a member of the excepted group ${exGroup}.` };
  if (exDomain) return { scoped: true, inScope: false, excluded: true, why: `This user's domain ${exDomain} is excepted.` };
  const scoped = Boolean(people.length || groupList.length || domainList.length);
  if (!scoped) return { scoped: false, inScope: true, excluded: false, why: `It names no ${f.noun}, so it covers everyone.` };
  const reasons = [];
  const misses = [];
  if (people.length) { const v = hitPeople(people, who); if (v) reasons.push(`this user is named on it (${v})`); else misses.push(`it names other ${f.noun} (${people.slice(0, 4).join(', ')}${people.length > 4 ? ', …' : ''})`); }
  if (groupList.length) { const v = hitGroups(groupList, who); if (v) reasons.push(`this user is a member of ${v}`); else misses.push(`this user is not in its groups (${groupList.slice(0, 4).join(', ')}${groupList.length > 4 ? ', …' : ''})`); }
  if (domainList.length) { const v = hitDomains(domainList, who); if (v) reasons.push(`this user's domain ${v} is listed`); else misses.push(`this user's domains are not listed (${domainList.slice(0, 4).join(', ')})`); }
  if (misses.length) return { scoped: true, inScope: false, excluded: false, why: `Not this user: ${misses.join('; ')}.` };
  return { scoped: true, inScope: true, excluded: false, why: `It includes this user because ${reasons.join(' and ')}.` };
}

const enabled = rule => !rule.State || /^enabled$/i.test(String(rule.State));
const prio = rule => (Number.isFinite(Number(rule.Priority)) ? Number(rule.Priority) : 0);

// The protection types the report explains. policyField is the rule property that names the policy.
export const PROTECTION = [
  { key: 'antiSpam', label: 'Anti-spam (inbound)', rules: 'spamRule', policies: 'spamPolicy', field: 'HostedContentFilterPolicy', preset: 'presetEop', portal: 'anti-spam' },
  { key: 'antiMalware', label: 'Anti-malware', rules: 'malwareRule', policies: 'malwarePolicy', field: 'MalwareFilterPolicy', preset: 'presetEop', portal: 'anti-malware' },
  { key: 'antiPhish', label: 'Anti-phishing', rules: 'phishRule', policies: 'phishPolicy', field: 'AntiPhishPolicy', preset: 'presetAtp', presetFallback: 'presetEop', portal: 'anti-phish' },
  { key: 'safeLinks', label: 'Safe Links', rules: 'safeLinksRule', policies: 'safeLinksPolicy', field: 'SafeLinksPolicy', preset: 'presetAtp', builtIn: true, defender: true, portal: 'safe-links' },
  { key: 'safeAttachments', label: 'Safe Attachments', rules: 'safeAttachRule', policies: 'safeAttachPolicy', field: 'SafeAttachmentPolicy', preset: 'presetAtp', builtIn: true, defender: true, portal: 'safe-attachments' },
  { key: 'outbound', label: 'Outbound spam and forwarding', rules: 'outboundRule', policies: 'outboundPolicy', field: 'HostedOutboundSpamFilterPolicy', side: 'sender', portal: 'outbound-spam' },
];

function presetName(rule) {
  const id = `${rule.Name || ''} ${rule.Identity || ''}`;
  return /strict/i.test(id) ? 'Strict' : /standard/i.test(id) ? 'Standard' : null;
}

// data: { [readName]: array of rows } for the reads that worked. Missing keys mean the read failed or was refused.
export function protectionFor(type, data, who) {
  const policies = arr(data[type.policies]);
  const findPolicy = name => policies.find(p => low(p.Name) === low(name)) || null;
  const side = type.side || 'recipient';
  const checked = [];
  // 1 and 2: preset security policies, Strict before Standard.
  for (const level of ['Strict', 'Standard']) {
    const source = [...arr(data[type.preset]), ...(type.presetFallback ? arr(data[type.presetFallback]) : [])];
    const rule = source.find(r => presetName(r) === level && (r[type.field] || !type.presetFallback));
    if (!rule || type.side === 'sender') continue;
    const match = scopeMatch(rule, who, side);
    if (!enabled(rule)) { checked.push(`The ${level} preset is turned off.`); continue; }
    if (match.inScope) {
      const name = rule[type.field] || `${level} Preset Security Policy`;
      return { applies: `${level} preset security policy`, policyName: name, policy: findPolicy(name), source: 'preset', why: `${level} preset security policy: ${match.why} Preset policies are applied before any custom policy, and Strict wins over Standard.`, checked };
    }
    checked.push(`The ${level} preset does not include this user. ${match.why}`);
  }
  // 3: custom policies by priority.
  const rules = arr(data[type.rules]).slice().sort((a, b) => prio(a) - prio(b));
  for (const rule of rules) {
    const match = scopeMatch(rule, who, side);
    if (!enabled(rule)) { if (match.inScope) checked.push(`Custom rule "${rule.Name}" would include this user, but it is turned off.`); continue; }
    if (match.inScope) {
      const name = rule[type.field] || rule.Name;
      return { applies: name, policyName: name, policy: findPolicy(name), source: 'custom', priority: prio(rule), rule: rule.Name, why: `Custom policy "${name}" (rule priority ${prio(rule)}): ${match.why} It is the first enabled custom policy, by priority, that includes this user.`, checked };
    }
  }
  if (rules.length) checked.push(`None of the ${rules.length} custom ${type.label} ${rules.length === 1 ? 'policy includes' : 'policies include'} this user.`);
  // 4: built-in protection for Safe Links and Safe Attachments.
  if (type.builtIn) {
    const rule = arr(data.builtIn)[0];
    const policy = policies.find(p => p.IsBuiltInProtection) || null;
    if (rule || policy) {
      const match = rule ? scopeMatch(rule, who, 'recipient') : { inScope: true, why: '' };
      if (match.inScope && (!rule || enabled(rule))) {
        return { applies: 'Built-in protection preset', policyName: policy?.Name || 'Built-In Protection Policy', policy, source: 'builtIn', why: 'No preset or custom policy includes this user, so the Built-in protection preset applies. Microsoft turns it on for every Defender for Office 365 tenant, and it covers everyone it does not exclude.', checked };
      }
      checked.push(`Built-in protection does not cover this user. ${match.why}`);
    }
    return { applies: null, policyName: null, policy: null, source: 'none', why: `No ${type.label} policy includes this user, and there is no Built-in protection policy, so ${type.label} does not protect this user's mail.`, checked };
  }
  // 5: the default policy.
  const fallback = policies.find(p => p.IsDefault === true || p.IsDefault === 'True') || policies.find(p => /default/i.test(p.Name || '')) || null;
  return { applies: fallback ? `${fallback.Name} (default policy)` : 'Default policy', policyName: fallback?.Name || 'Default', policy: fallback, source: 'default', why: `No preset or custom policy includes this user, so the default ${type.label} policy applies. It covers everyone that no other policy covers.`, checked };
}

// Mail flow (transport) rules: every enabled rule whose conditions are true runs, in priority order.
export function transportRuleFor(rule, who) {
  const to = scopeMatch(rule, who, 'recipient');
  const from = scopeMatch(rule, who, 'sender');
  const audit = /audit/i.test(String(rule.Mode || ''));
  const on = enabled(rule);
  const words = [];
  let reach;
  if (to.excluded || from.excluded) {
    reach = 'excluded';
    words.push((to.excluded ? to : from).why);
  } else if (!to.scoped && !from.scoped) {
    reach = 'everyone';
    const scope = [rule.SentToScope && `sent ${/not/i.test(rule.SentToScope) ? 'outside' : 'inside'} the organization`, rule.FromScope && `from ${/not/i.test(rule.FromScope) ? 'outside' : 'inside'} the organization`].filter(Boolean).join(' and ');
    words.push(`It names no person, group or domain, so it can act on any message${scope ? ` ${scope}` : ''}, including this user's. Its other conditions decide which messages.`);
  } else if (to.scoped && to.inScope && from.scoped && from.inScope) {
    reach = 'both';
    words.push(`It acts on mail sent to and from this user. ${to.why}`);
  } else if (to.scoped && to.inScope) {
    reach = 'to';
    words.push(`It acts on mail sent to this user${from.scoped ? ' from the senders it lists' : ''}. ${to.why}`);
  } else if (from.scoped && from.inScope) {
    reach = 'from';
    words.push(`It acts on mail this user sends${to.scoped ? ' to the recipients it lists' : ''}. ${from.why}`);
  } else {
    reach = 'none';
    words.push((to.scoped ? to : from).why);
  }
  if (!on) words.push('It is turned off, so it does nothing today.');
  else if (audit) words.push(`It is in test mode (${rule.Mode}), so it only logs and does not change mail.`);
  if (rule.StopRuleProcessing && reach !== 'none' && reach !== 'excluded') words.push('When it matches, later rules are not processed for that message.');
  if (rule.ExpiryDate) words.push(`It stops on ${rule.ExpiryDate}.`);
  if (rule.ActivationDate) words.push(`It starts on ${rule.ActivationDate}.`);
  const applies = on && !audit && reach !== 'none' && reach !== 'excluded';
  return { name: rule.Name, priority: prio(rule), state: on ? 'Enabled' : 'Disabled', mode: rule.Mode || 'Enforce', reach, applies, why: words.join(' '), description: String(rule.Description || '').replace(/\r/g, '').replace(/\t/g, '  ').trim() };
}

export function transportRulesFor(rules, who) {
  return arr(rules).slice().sort((a, b) => prio(a) - prio(b)).map(rule => transportRuleFor(rule, who));
}

// Purview locations: "All", or a list of people and groups. Exceptions win.
function locationMatch(include, exclude, who) {
  const inc = arr(include);
  const exPerson = hitPeople(exclude, who) || hitGroups(exclude, who);
  if (exPerson) return { inScope: false, why: `This user is excluded (${exPerson}).` };
  if (!inc.length) return { inScope: false, why: 'Exchange is not a location on this policy.' };
  if (inc.some(v => low(v) === 'all')) return { inScope: true, why: 'It covers all mailboxes.' };
  const person = hitPeople(inc, who);
  if (person) return { inScope: true, why: `This mailbox is named on it (${person}).` };
  const group = hitGroups(inc, who);
  if (group) return { inScope: true, why: `This user is a member of ${group}, which is on it.` };
  return { inScope: false, why: 'It is limited to other mailboxes or groups.' };
}

const isOn = p => p.Enabled !== false && p.Enabled !== 'False' && !/^disable/i.test(String(p.Mode || ''));

export function dlpFor(policies, who) {
  return arr(policies).filter(p => /exchange/i.test(arr(p.Workload).join(','))).map(p => {
    const people = locationMatch(p.ExchangeLocation, p.ExchangeLocationException, who);
    let inScope = people.inScope;
    let why = people.why;
    if (!arr(p.ExchangeLocation).length && arr(p.ExchangeSenderMemberOf).length) {
      const g = hitGroups(p.ExchangeSenderMemberOf, who);
      inScope = Boolean(g);
      why = g ? `This user is a member of ${g}, a sender group on it.` : 'It is limited to sender groups this user is not in.';
    }
    const exGroup = hitGroups(p.ExchangeSenderMemberOfException, who);
    if (exGroup) { inScope = false; why = `This user is excluded as a member of ${exGroup}.`; }
    const mode = String(p.Mode || 'Enable');
    const test = /test/i.test(mode);
    const on = isOn(p);
    const effect = !on ? 'It is turned off.' : test ? `It is in test mode (${mode}), so it shows tips or logs and does not block.` : 'It is enforced, so a match can block the message or warn the sender.';
    return { name: p.Name, applies: inScope && on, inScope, mode, why: `${why} It checks email this user sends. ${effect}` };
  });
}

function retentionWords(rule) {
  if (!rule) return '';
  const raw = String(rule.RetentionDuration ?? '');
  const days = Number(raw);
  const span = /unlimited/i.test(raw) ? 'forever' : Number.isFinite(days) && days > 0 ? (days % 365 === 0 ? `${days / 365} year${days === 365 ? '' : 's'}` : `${days} days`) : raw;
  const action = String(rule.RetentionComplianceAction || '');
  if (/^keepanddelete$/i.test(action)) return `Keeps items for ${span}, then deletes them.`;
  if (/^keep$/i.test(action)) return `Keeps items for ${span}. Users can delete them, but a copy is kept.`;
  if (/^delete$/i.test(action)) return `Deletes items older than ${span}.`;
  return span ? `Retention period ${span}.` : '';
}

export function retentionFor(policies, rules, who) {
  return arr(policies).map(p => {
    const match = locationMatch(p.ExchangeLocation, p.ExchangeLocationException, who);
    const rule = arr(rules).find(r => low(r.Policy) === low(p.Name) || low(r.Policy) === low(p.Guid));
    const on = isOn(p);
    return { name: p.Name, guid: low(p.Guid).replace(/-/g, ''), applies: match.inScope && on, inScope: match.inScope, why: `${match.why}${on ? '' : ' It is turned off.'}`, effect: retentionWords(rule) };
  }).filter(r => r.inScope || arr(policies).length <= 25);
}

export function labelPoliciesFor(policies, who) {
  return arr(policies).map(p => {
    const match = locationMatch(p.ExchangeLocation, p.ExchangeLocationException, who);
    return { name: p.Name, applies: match.inScope && isOn(p), why: match.why, labels: arr(p.Labels).map(String) };
  });
}

export function caseHoldsFor(holds, cases, who) {
  const caseName = id => arr(cases).find(c => low(c.Identity) === low(id) || low(c.Name) === low(id))?.Name || '';
  return arr(holds).map(h => {
    const match = locationMatch(h.ExchangeLocation, [], who);
    const on = isOn(h);
    return { name: h.Name, guid: low(h.Guid).replace(/-/g, ''), case: caseName(h.CaseId), applies: match.inScope && on, why: `${match.why}${on ? '' : ' The hold is turned off.'}` };
  });
}

// Mailbox InPlaceHolds values, in Microsoft's documented prefixes (Learn: "How to identify the type of hold placed on a mailbox").
export function decodeHolds(values, { retention = [], holds = [] } = {}) {
  return arr(values).map(raw => {
    const value = String(raw);
    const excluded = value.startsWith('-');
    const body = value.replace(/^-/, '');
    const guidOf = s => low(s.replace(/^(mbx|skp|grp|uni|unih|cld)/i, '').split(':')[0]).replace(/-/g, '');
    let kind;
    let name = '';
    if (/^mbx/i.test(body)) { kind = 'Purview retention policy for Exchange'; name = retention.find(r => r.guid && r.guid === guidOf(body))?.name || ''; }
    else if (/^skp/i.test(body)) kind = 'Purview retention policy for Teams or Skype chats';
    else if (/^grp/i.test(body)) kind = 'Purview retention policy for Microsoft 365 groups';
    else if (/^unih/i.test(body)) { kind = 'eDiscovery case hold'; name = holds.find(h => h.guid && body.toLowerCase().replace(/-/g, '').includes(h.guid))?.name || ''; }
    else if (/^cld/i.test(body)) kind = 'In-place hold (older eDiscovery)';
    else kind = 'In-place eDiscovery hold (older)';
    return { value, kind, name, excluded, words: excluded ? `This mailbox is excluded from an organization-wide ${kind.toLowerCase()}${name ? ` (${name})` : ''}.` : `${kind}${name ? `: ${name}` : ''}.` };
  });
}

// Conditional Access, from the raw Graph policy objects.
const EXCHANGE_APP = '00000002-0000-0ff1-ce00-000000000000';
const GRANT = {
  mfa: 'require multifactor authentication', block: 'block access', compliantDevice: 'require a compliant device',
  domainJoinedDevice: 'require a hybrid Microsoft Entra joined device', approvedApplication: 'require an approved client app',
  compliantApplication: 'require an app protection policy', passwordChange: 'require a password change',
};
export function conditionalAccessFor(policies, who, userId) {
  const id = low(userId);
  const groupIds = new Set([...who.groupNames.keys()]);
  const roleTemplates = new Set(who.roles.map(r => low(r.roleTemplateId)).filter(Boolean));
  return arr(policies).map(p => {
    const users = p.conditions?.users || {};
    const apps = p.conditions?.applications || {};
    const includeApps = arr(apps.includeApplications);
    const coversExchange = includeApps.some(a => /^all$/i.test(a) || /^office365$/i.test(a) || low(a) === EXCHANGE_APP) && !arr(apps.excludeApplications).some(a => /^office365$/i.test(a) || low(a) === EXCHANGE_APP);
    const excluded = arr(users.excludeUsers).map(low).includes(id) || arr(users.excludeGroups).some(g => groupIds.has(low(g))) || arr(users.excludeRoles).some(r => roleTemplates.has(low(r)));
    const included = arr(users.includeUsers).some(u => /^all$/i.test(u) || low(u) === id) || arr(users.includeGroups).some(g => groupIds.has(low(g))) || arr(users.includeRoles).some(r => roleTemplates.has(low(r)));
    const controls = arr(p.grantControls?.builtInControls).map(c => GRANT[c] || c);
    if (p.grantControls?.authenticationStrength?.displayName) controls.push(`require the authentication strength "${p.grantControls.authenticationStrength.displayName}"`);
    const session = [];
    if (p.sessionControls?.signInFrequency?.isEnabled) session.push(`sign in again every ${p.sessionControls.signInFrequency.value} ${p.sessionControls.signInFrequency.type}`);
    if (p.sessionControls?.applicationEnforcedRestrictions?.isEnabled) session.push('limited Outlook on the web on unmanaged devices');
    if (p.sessionControls?.persistentBrowser?.isEnabled) session.push(`persistent browser ${p.sessionControls.persistentBrowser.mode}`);
    const when = [];
    const clients = arr(p.conditions?.clientAppTypes).filter(c => c !== 'all');
    if (clients.length) when.push(`client apps: ${clients.map(c => ({ exchangeActiveSync: 'Exchange ActiveSync', other: 'legacy authentication clients', browser: 'browsers', mobileAppsAndDesktopClients: 'mobile and desktop apps' }[c] || c)).join(', ')}`);
    if (arr(p.conditions?.locations?.includeLocations).length) when.push('certain locations');
    if (arr(p.conditions?.platforms?.includePlatforms).length) when.push(`platforms: ${arr(p.conditions.platforms.includePlatforms).join(', ')}`);
    if (arr(p.conditions?.signInRiskLevels).length) when.push(`sign-in risk: ${arr(p.conditions.signInRiskLevels).join(', ')}`);
    if (arr(p.conditions?.userRiskLevels).length) when.push(`user risk: ${arr(p.conditions.userRiskLevels).join(', ')}`);
    const state = String(p.state || '');
    const reportOnly = /reporting/i.test(state);
    let why;
    if (!coversExchange) why = 'Its cloud apps do not include Exchange Online or Office 365.';
    else if (excluded) why = 'This user is excluded from it.';
    else if (!included) why = 'This user is not in its included users, groups or roles.';
    else why = `It covers Exchange Online and includes this user.${when.length ? ` Only when: ${when.join('; ')}.` : ''}`;
    const effect = [controls.length ? `Grant: ${controls.join(p.grantControls?.operator === 'OR' ? ' or ' : ' and ')}.` : '', session.length ? `Session: ${session.join(', ')}.` : ''].filter(Boolean).join(' ');
    const applies = coversExchange && included && !excluded;
    return { id: p.id, name: p.displayName, state: state === 'enabled' ? 'On' : reportOnly ? 'Report-only' : 'Off', applies: applies && state === 'enabled', inScope: applies, why: `${why}${applies && reportOnly ? ' It is report-only, so it is logged and not enforced.' : ''}${applies && state === 'disabled' ? ' It is turned off.' : ''}`, effect };
  });
}
