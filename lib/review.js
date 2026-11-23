// Config review: every area of an Exchange Online and Purview job, checked against the live (or demo)
// configuration, in plain words. Each finding says what is configured, why it matters and what to check next.
// Pure function: the page, the tests and the demo all call reviewTenant() with already-read data.

const arr = v => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]);
const low = v => String(v ?? '').toLowerCase();
const yes = v => v === true || v === 'True' || v === 'true';
const no = v => v === false || v === 'False' || v === 'false';
const enabledRule = r => !r.State || /^enabled$/i.test(String(r.State));
const list = (items, max = 6) => {
  const a = arr(items).filter(Boolean).map(String);
  return a.length > max ? `${a.slice(0, max).join(', ')} and ${a.length - max} more` : a.join(', ');
};
const isMicrosoftDomain = d => /\.onmicrosoft\.com$|\.mail\.onmicrosoft\.com$/i.test(d);

export const SEVERITY_ORDER = ['high', 'medium', 'low', 'info', 'ok'];
export const SEVERITY_LABEL = { high: 'Fix first', medium: 'Check', low: 'Tidy up', info: 'Note', ok: 'OK' };

function area(id, title, portals, reads) { return { id, title, portals, reads, findings: [] }; }
function add(a, severity, title, why, next) { a.findings.push({ severity, title, why: why || '', next: next || '' }); }

function deniedFor(a, errors) {
  const hit = (a.reads || []).map(n => errors?.[n]).filter(Boolean);
  if (!hit.length) return false;
  const seen = new Set();
  for (const e of hit) {
    const key = e.label + e.message;
    if (seen.has(key)) continue;
    seen.add(key);
    a.findings.push({ severity: 'info', label: e.label || 'Could not read', title: e.label === 'License required' ? 'Part of this area needs a license this tenant does not have' : e.label === 'Not authorized' ? 'Not authorized to read part of this area' : 'Part of this area could not be read', why: e.message || '', next: e.label === 'Not authorized' ? `Sign in with an account that has ${e.role || 'the role named above'}.` : '' });
  }
  return true;
}

function policyKind(p) {
  if (p.RecommendedPolicyType) return `${p.RecommendedPolicyType} preset`;
  if (yes(p.IsBuiltInProtection)) return 'Built-in protection';
  if (yes(p.IsDefault)) return 'Default';
  return 'Custom';
}

// ---- Domains, SPF, DKIM, DMARC
function reviewDomains(s, errors, domains) {
  const a = area('auth-dns', 'SPF, DKIM and DMARC', ['spf-dmarc', 'dkim', 'accepted-domains'], ['accepted', 'dkim']);
  deniedFor(a, errors);
  const accepted = arr(s.accepted);
  const dnsRows = Array.isArray(domains) ? domains : [];
  const names = accepted.length ? accepted.map(d => ({ name: d.DomainName || d.Name, type: d.DomainType })) : dnsRows.map(d => ({ name: d.name, type: d.type }));
  const dkim = arr(s.dkim);
  for (const { name, type } of names) {
    if (!name || isMicrosoftDomain(name)) continue;
    if (/internalrelay|externalrelay/i.test(type || '')) add(a, 'info', `${name} is a relay domain (${type})`, 'Mail for a relay domain that does not match a mailbox here is passed on to another system through a connector.', 'Confirm an outbound connector routes this domain, or mail to unknown users loops or bounces.');
    const dns = dnsRows.find(d => low(d.name) === low(name))?.dns;
    if (dns) {
      const spf = dns.spf || {};
      if (!spf.record) add(a, 'high', `${name} has no SPF record`, 'Receivers cannot tell which servers may send for this domain, so spoofed mail is more likely to land and your own mail is more likely to be junked.', `Publish TXT "v=spf1 include:spf.protection.outlook.com -all" at ${name}, adding any other senders you use.`);
      else {
        if (/\+all\b/.test(spf.record) || (spf.qualifier === '+' && /all/.test(spf.record))) add(a, 'high', `${name} SPF ends in +all`, '+all says every server on the internet may send as this domain. SPF then protects nothing.', 'Change the end of the record to -all or ~all.');
        else if (spf.qualifier === '~') add(a, 'low', `${name} SPF ends in ~all (soft fail)`, 'Soft fail is common and works when DMARC is enforced. On its own it asks receivers to accept failing mail.', 'Move to -all once every sending service is listed, or rely on DMARC quarantine or reject.');
        if (Number(spf.lookups) > 10) add(a, 'high', `${name} SPF needs ${spf.lookups} DNS lookups`, 'SPF allows 10 lookups. Above that the result is permerror, which receivers treat as a failure.', 'Flatten or remove include: entries you no longer use.');
        if (spf.qualifier === '-' && Number(spf.lookups || 0) <= 10) add(a, 'ok', `${name} SPF ends in -all`, 'Servers not listed are told to fail SPF.');
        if (spf.record && !spf.exo && dns.mx?.exo) add(a, 'medium', `${name} SPF does not include Exchange Online`, 'Mail sent from Exchange Online will fail SPF for this domain.', 'Add include:spf.protection.outlook.com.');
      }
      const dmarc = dns.dmarc || {};
      if (!dmarc.record) add(a, 'high', `${name} has no DMARC record`, 'Without DMARC, receivers decide on their own what to do with mail that fails SPF and DKIM, and you get no reports about who sends as you.', `Start with TXT at _dmarc.${name}: "v=DMARC1; p=none; rua=mailto:dmarc@${name}", then move to quarantine and reject.`);
      else if (low(dmarc.policy) === 'none') add(a, 'medium', `${name} DMARC is p=none (monitor only)`, 'p=none collects reports but asks receivers to deliver failing mail anyway. It is a starting point, not protection.', 'Read the aggregate reports, fix legitimate senders, then move to p=quarantine and p=reject.');
      else add(a, 'ok', `${name} DMARC is p=${dmarc.policy}`, 'Receivers are asked to quarantine or reject mail that fails DMARC.');
      if (!dns.mx?.exo) add(a, 'info', `${name} MX does not point at Exchange Online`, 'Another system receives mail first, such as a gateway or on-premises server. Exchange Online then sees that system as the sender, which hurts SPF and spoof checks.', 'If a gateway is in front, turn on Enhanced Filtering for Connectors on the inbound connector (see Connectors).');
    }
    const signing = dkim.find(d => low(d.Domain) === low(name));
    if (dkim.length || !errors?.dkim) {
      if (!signing || no(signing.Enabled)) {
        const cname = dns?.dkim?.some(d => d.target?.length);
        add(a, 'medium', `${name} is not DKIM signed by Exchange Online`, 'Outbound mail is signed with the onmicrosoft.com domain instead, so DKIM does not align with the From domain and DMARC rests on SPF alone, which breaks on forwarding.', cname ? 'The CNAMEs are published. Turn on signing in the Defender portal, Email authentication, DKIM.' : `Publish selector1 and selector2 CNAMEs for ${name}, then turn on signing.`);
      } else if (signing.Status && !/valid/i.test(signing.Status)) add(a, 'medium', `${name} DKIM status is ${signing.Status}`, 'Signing is turned on but Exchange Online reports a problem with the key or the DNS records.', `Check that the selector CNAMEs point at ${signing.Selector1CNAME || 'the values shown in the Defender portal'}.`);
      else add(a, 'ok', `${name} is DKIM signed`, 'Outbound mail carries a DKIM signature that aligns with this domain.');
    }
  }
  if (!names.length && !a.findings.length) add(a, 'info', 'No domains were returned', 'Domains and DNS needs a Graph or Exchange read to run these checks.');
  return a;
}

// ---- Mail flow rules
function reviewRules(s, errors) {
  const a = area('rules', 'Mail flow (transport) rules', ['transport-rules'], ['rules', 'externalTag']);
  deniedFor(a, errors);
  const rules = arr(s.rules);
  if (!errors?.rules) add(a, 'info', `${rules.length} mail flow rule${rules.length === 1 ? '' : 's'}`, rules.length ? `In priority order: ${list([...rules].sort((x, y) => Number(x.Priority) - Number(y.Priority)).map(r => r.Name), 8)}.` : 'No transport rules. That is normal for a small tenant.');
  for (const r of rules) {
    const on = enabledRule(r);
    if (Number(r.SetSCL) === -1 && on) {
      const spoofable = arr(r.SenderDomainIs).length || arr(r.From).length;
      const pinned = arr(r.SenderIpRanges).length;
      add(a, spoofable && !pinned ? 'high' : 'medium', `"${r.Name}" skips spam filtering (SCL -1)`, spoofable && !pinned
        ? 'It trusts the sender domain or address alone. Anyone can forge those, so a phisher who spoofs that domain skips spam filtering. This is one of the most common ways phish reaches inboxes.'
        : 'Messages that match are delivered without spam filtering. Malware filtering and Safe Attachments still run.', pinned ? 'Confirm the IP ranges are still the partner\'s and still need the bypass.' : 'Add a sender IP condition, or replace the bypass with a tenant allow entry or an advanced delivery policy for phishing simulations.');
    }
    if (on && r.Mode && !/enforce/i.test(r.Mode)) add(a, 'info', `"${r.Name}" is in test mode (${r.Mode})`, 'The rule logs matches, and may send a policy tip, but takes no action on the message.', 'Use message trace on a matching message to confirm it hits, then switch it to Enforce.');
    if (!on) add(a, 'low', `"${r.Name}" is disabled`, 'Disabled rules do nothing, but they confuse the next person reading the rule list.', 'Delete it after a change request if nobody needs it.');
    if (r.ExpiryDate && new Date(r.ExpiryDate) < new Date()) add(a, 'low', `"${r.Name}" expired on ${String(r.ExpiryDate).slice(0, 10)}`, 'It no longer acts on mail.', 'Remove it or extend the date.');
    const outside = [...arr(r.RedirectMessageTo), ...arr(r.BlindCopyTo), ...arr(r.AddToRecipients), ...arr(r.CopyTo)];
    if (on && outside.length) add(a, 'medium', `"${r.Name}" copies or redirects mail to ${list(outside, 3)}`, 'Mail rules that copy or redirect are a classic way for data to leave quietly. Each one needs an owner and a reason.', 'Confirm the destination is approved and inside the organization or a journaling service.');
    if (on && (yes(r.DeleteMessage) || r.RejectMessageReasonText)) add(a, 'info', `"${r.Name}" ${yes(r.DeleteMessage) ? 'deletes' : 'rejects'} matching mail`, 'Senders of matching mail never reach the recipient. In message trace this shows as a Transport rule event followed by Fail or Drop.', 'When a user says mail never arrived, check this rule in message trace detail first.');
  }
  const tagged = rules.some(r => enabledRule(r) && /notinorganization/i.test(String(r.FromScope)) && (r.PrependSubject || r.ApplyHtmlDisclaimerText || /prepend|disclaimer/i.test(r.Description || '')));
  const tag = arr(s.externalTag)[0];
  if (tag && !yes(tag.Enabled) && !tagged) add(a, 'low', 'External mail is not tagged', 'Users get no visual cue that a message came from outside, which makes impersonation of internal people easier.', 'Turn on the native External tag (Set-ExternalInOutlook -Enabled $true) instead of a subject-prefix rule.');
  else if (tag && yes(tag.Enabled)) add(a, 'ok', 'Outlook shows the External tag', 'Messages from outside the organization are marked in Outlook.');
  return a;
}

// ---- Connectors
function reviewConnectors(s, errors, domains) {
  const a = area('connectors', 'Connectors and mail flow security', ['connectors'], ['inbound', 'outbound']);
  deniedFor(a, errors);
  const inbound = arr(s.inbound);
  const outbound = arr(s.outbound);
  if (!errors?.inbound) add(a, 'info', `Connectors: ${inbound.length} inbound, ${outbound.length} outbound`, inbound.length + outbound.length ? `${list([...inbound, ...outbound].map(c => c.Name))}.` : 'No connectors. Mail flows directly between Exchange Online and the internet.');
  for (const c of inbound) {
    if (no(c.Enabled)) { add(a, 'low', `Inbound "${c.Name}" is disabled`, 'It does not affect mail.', 'Remove it if it is no longer needed.'); continue; }
    if (/partner/i.test(c.ConnectorType || '') && !yes(c.RequireTls) && !yes(c.RestrictDomainsToCertificate) && !yes(c.RestrictDomainsToIPAddresses)) add(a, 'medium', `Inbound "${c.Name}" does not require TLS or restrict the sender`, 'A partner connector that only matches the sender domain can be matched by anyone who forges that domain.', 'Require TLS with the partner certificate name, or restrict to the partner IP addresses.');
    if (yes(c.EFSkipLastIP) || arr(c.EFSkipIPs).length) add(a, 'ok', `Enhanced Filtering is on for "${c.Name}"`, 'Exchange Online looks past the gateway to the real sending IP, so SPF and spoof checks work.');
  }
  const gateway = (Array.isArray(domains) ? domains : []).some(d => d.dns && d.dns.mx && !d.dns.mx.exo && !/relay/i.test(d.type || '') && !isMicrosoftDomain(d.name));
  if (gateway && !inbound.some(c => yes(c.EFSkipLastIP) || arr(c.EFSkipIPs).length)) add(a, 'medium', 'A gateway receives mail first, and Enhanced Filtering is off', 'Every message then looks like it came from the gateway. SPF, DMARC and spoof intelligence judge the gateway, not the real sender, so spoofed mail gets through and good mail gets junked.', 'On the inbound connector from the gateway, turn on Enhanced Filtering (skip the gateway IPs or the last IP).');
  for (const c of outbound) {
    if (no(c.Enabled)) { add(a, 'low', `Outbound "${c.Name}" is disabled`, 'It does not affect mail.'); continue; }
    if (!c.TlsSettings) add(a, 'medium', `Outbound "${c.Name}" uses opportunistic TLS`, 'If the destination does not offer TLS, mail goes in clear text.', 'Set TLS to certificate or domain validation for partners that must be encrypted.');
    if (yes(c.IsTransportRuleScoped)) add(a, 'info', `Outbound "${c.Name}" is used only by a mail flow rule`, 'Mail goes through it only when a rule routes it there.', 'If routing looks wrong, check the rule with RouteMessageOutboundConnector.');
  }
  const arc = arr(s.arc)[0];
  if (arc && arr(arc.ArcTrustedSealers).length) add(a, 'info', `Trusted ARC sealers: ${list(arc.ArcTrustedSealers)}`, 'Exchange Online honours the authentication results these intermediaries recorded.');
  return a;
}

// ---- Anti-spam
function reviewSpam(s, errors) {
  const a = area('anti-spam', 'Anti-spam and connection filtering', ['anti-spam', 'preset-policies'], ['spamPolicy', 'connectionPolicy', 'allowSenders', 'presetEop']);
  deniedFor(a, errors);
  for (const p of arr(s.spamPolicy)) {
    if (p.RecommendedPolicyType) continue;
    const kind = policyKind(p);
    const domainsAllowed = arr(p.AllowedSenderDomains);
    if (domainsAllowed.length) add(a, 'high', `${kind} anti-spam policy "${p.Name}" allows sender domains: ${list(domainsAllowed, 4)}`, 'Allowed domains skip spam filtering, and the domain is checked against an address anyone can forge. Microsoft recommends against it.', 'Remove them. For a real need use a tenant allow entry, which still checks authentication.');
    else if (Number(p.AllowedSenderCount) > 0) add(a, 'medium', `${kind} anti-spam policy "${p.Name}" allows ${p.AllowedSenderCount} sender${Number(p.AllowedSenderCount) === 1 ? '' : 's'}`, 'Allowed senders skip spam filtering.', 'Review the list. Prefer tenant allow entries.');
    if (p.HighConfidencePhishAction && !/quarantine/i.test(p.HighConfidencePhishAction)) add(a, 'high', `"${p.Name}" does not quarantine high-confidence phish`, `High-confidence phish goes to ${p.HighConfidencePhishAction}. Users can open it.`, 'Set the high-confidence phishing action to Quarantine.');
    if (p.PhishSpamAction && /jmf|movetojmf|addxheader|modifysubject/i.test(p.PhishSpamAction)) add(a, 'medium', `"${p.Name}" sends phish to Junk`, 'Phishing ends up in a folder users open.', 'Set the phishing action to Quarantine, as the Standard preset does.');
    if (no(p.SpamZapEnabled) || no(p.PhishZapEnabled)) add(a, 'medium', `Zero-hour auto purge is off on "${p.Name}"`, 'Mail later found to be spam or phish stays in the inbox.', 'Turn ZAP on for spam and phish.');
    if (Number(p.BulkThreshold) > 7) add(a, 'low', `"${p.Name}" bulk threshold is ${p.BulkThreshold}`, 'Higher numbers let more bulk mail through. The default is 7 and Standard uses 6.', 'Lower it if users complain about newsletters.');
  }
  for (const c of arr(s.connectionPolicy)) {
    if (arr(c.IPAllowList).length) add(a, 'medium', `Connection filter allows IPs: ${list(c.IPAllowList, 4)}`, 'Mail from these IPs skips spam filtering entirely.', 'Confirm each IP is yours or a known partner, and still needed.');
    if (yes(c.EnableSafeList)) add(a, 'low', 'The Microsoft safe list is on', 'Mail from senders on a Microsoft-maintained list skips spam filtering. Microsoft recommends it off.', 'Turn EnableSafeList off.');
  }
  const allow = arr(s.allowSenders);
  if (allow.length) add(a, 'info', `${allow.length} tenant allow entr${allow.length === 1 ? 'y' : 'ies'} for senders`, `${list(allow.map(x => `${x.Value}${x.ExpirationDate ? '' : ' (never expires)'}`), 5)}.`, 'Tenant allow entries still check authentication, but each one should expire.');
  const presets = arr(s.presetEop).filter(enabledRule);
  if (!errors?.presetEop) add(a, presets.length ? 'ok' : 'low', presets.length ? `Preset policies in use: ${list(presets.map(r => r.Name))}` : 'Standard and Strict preset policies are not turned on', presets.length ? 'Microsoft keeps preset settings current.' : 'Custom policies drift from Microsoft\'s recommended settings over time. Presets are updated by Microsoft.', presets.length ? '' : 'Turn on the Standard preset for everyone and Strict for high-value people.');
  return a;
}

// ---- Anti-phish, spoofing and impersonation
function reviewPhish(s, errors, defender) {
  const a = area('anti-phish', 'Anti-phishing, spoofing and impersonation', ['anti-phish'], ['phishPolicy', 'phishRule']);
  deniedFor(a, errors);
  const policies = arr(s.phishPolicy);
  for (const p of policies) {
    if (p.RecommendedPolicyType) continue;
    if (no(p.EnableSpoofIntelligence)) add(a, 'high', `Spoof intelligence is off on "${p.Name}"`, 'Mail that forges a sender and fails authentication is not caught as spoof.', 'Turn on spoof intelligence.');
    if (no(p.HonorDmarcPolicy)) add(a, 'medium', `"${p.Name}" ignores the sender's DMARC policy`, 'When a sender publishes p=reject, Exchange Online will not reject mail that fails it.', 'Turn on Honor DMARC record policy.');
    if (no(p.EnableUnauthenticatedSender)) add(a, 'low', `"${p.Name}" hides the unauthenticated sender question mark`, 'Users lose the visual cue on mail that fails authentication.', 'Turn on the unauthenticated sender indicator.');
  }
  if (defender !== false) {
    const presetOn = arr(s.presetAtp).some(enabledRule);
    const imp = policies.some(p => !yes(p.IsDefault) && (yes(p.EnableTargetedUserProtection) || yes(p.EnableOrganizationDomainsProtection) || yes(p.EnableMailboxIntelligenceProtection)));
    if (presetOn || imp) add(a, 'ok', 'Impersonation protection is configured', presetOn ? 'A Defender preset policy is on, which includes impersonation protection.' : `Turned on in ${list(policies.filter(p => yes(p.EnableTargetedUserProtection) || yes(p.EnableOrganizationDomainsProtection)).map(p => p.Name))}.`);
    else if (policies.length) add(a, 'medium', 'Impersonation protection is not turned on', 'Without user and domain impersonation protection, a lookalike such as ce0@contoso.com is judged only by spam filtering.', 'Add executives and finance under protected users, turn on protection for your own domains and mailbox intelligence, or turn on the Standard preset.');
    for (const p of policies) {
      if (yes(p.EnableTargetedUserProtection) && Number(p.TargetedUsersCount) === 0) add(a, 'low', `"${p.Name}" protects users but lists nobody`, 'User impersonation protection is on with an empty list.', 'Add the people most likely to be impersonated.');
      if (yes(p.EnableTargetedUserProtection) && /^(NoAction|)$/i.test(String(p.TargetedUserProtectionAction || ''))) add(a, 'low', `"${p.Name}" detects user impersonation but takes no action`, 'Detections are logged only.', 'Set the action to Quarantine.');
    }
  }
  if (!policies.length && !errors?.phishPolicy) add(a, 'info', 'No anti-phish policies returned', 'Every tenant has a default anti-phish policy, so this usually means the read was empty.');
  return a;
}

// ---- Safe Links, Safe Attachments, malware
function reviewDefender(s, errors, defender) {
  const a = area('defender', 'Defender for Office 365: Safe Links, Safe Attachments and malware', ['safe-links', 'safe-attachments', 'anti-malware'], ['safeLinksPolicy', 'safeAttachPolicy', 'malwarePolicy', 'atpGlobal']);
  const deniedAny = deniedFor(a, errors);
  if (defender === false && !deniedAny) add(a, 'info', 'Defender for Office 365 is not licensed', 'Safe Links, Safe Attachments and impersonation protection need Plan 1 or Plan 2. Exchange Online Protection still filters spam and malware.');
  const links = arr(s.safeLinksPolicy);
  const customLinks = arr(s.safeLinksRule).filter(enabledRule);
  if (links.length && !customLinks.length && !arr(s.presetAtp).some(enabledRule)) add(a, 'low', 'Only Built-in protection covers Safe Links', 'Built-in protection applies to everyone not in another policy, with Microsoft defaults. You cannot change its settings or see exceptions per group.', 'Create a policy or turn on the Standard preset if you need internal sender scanning or different settings.');
  for (const p of links) {
    const kind = policyKind(p);
    if (no(p.EnableSafeLinksForEmail)) add(a, 'high', `${kind} Safe Links "${p.Name}" is off for email`, 'Links in mail are not checked at click time.', 'Turn on Safe Links for email.');
    if (yes(p.AllowClickThrough)) add(a, 'medium', `${kind} Safe Links "${p.Name}" lets users click through warnings`, 'A user can ignore the block page and open a known malicious site.', 'Turn off "Let users click through to the original URL".');
    if (no(p.ScanUrls)) add(a, 'medium', `${kind} Safe Links "${p.Name}" does not scan URLs in real time`, 'Links are checked only against the known bad list, not detonated.', 'Turn on real-time URL scanning.');
    if (!yes(p.IsBuiltInProtection) && no(p.EnableForInternalSenders)) add(a, 'low', `${kind} Safe Links "${p.Name}" skips internal senders`, 'A compromised internal account can send malicious links unchecked.', 'Turn on Safe Links for messages sent within the organization.');
    if (no(p.DeliverMessageAfterScan)) add(a, 'low', `${kind} Safe Links "${p.Name}" delivers before the scan finishes`, 'Users can click a link that is still being checked.', 'Turn on "Wait for URL scanning to complete before delivering".');
  }
  for (const p of arr(s.safeAttachPolicy)) {
    const kind = policyKind(p);
    if (no(p.Enable) || /^allow$/i.test(p.Action || '')) add(a, 'high', `${kind} Safe Attachments "${p.Name}" does not block`, `The action is ${p.Action || 'off'}, so malicious attachments are delivered.`, 'Set the action to Block or Dynamic Delivery.');
    else add(a, 'ok', `${kind} Safe Attachments "${p.Name}" is ${p.Action}`, p.Action === 'DynamicDelivery' ? 'The body arrives first and attachments follow after detonation.' : 'Attachments are detonated before delivery.');
  }
  const g = arr(s.atpGlobal)[0];
  if (g && no(g.EnableATPForSPOTeamsODB)) add(a, 'low', 'Safe Attachments for SharePoint, OneDrive and Teams is off', 'Malicious files shared in those places are not blocked.', 'Turn it on in the global settings for Safe Attachments.');
  for (const p of arr(s.malwarePolicy)) {
    if (p.RecommendedPolicyType) continue;
    if (no(p.EnableFileFilter)) add(a, 'medium', `Anti-malware "${p.Name}" has the common attachments filter off`, 'Executable and script file types are not blocked by type.', 'Turn on the common attachments filter.');
    if (no(p.ZapEnabled)) add(a, 'medium', `Anti-malware "${p.Name}" has ZAP off`, 'Malware found after delivery stays in mailboxes.', 'Turn on zero-hour auto purge for malware.');
  }
  return a;
}

// ---- Outbound and forwarding
function reviewOutbound(s, errors, recipients) {
  const a = area('outbound', 'Outbound spam and external forwarding', ['outbound-spam', 'remote-domains', 'forwarding'], ['outboundPolicy', 'remote']);
  deniedFor(a, errors);
  for (const p of arr(s.outboundPolicy)) {
    if (/^on$/i.test(p.AutoForwardingMode || '')) add(a, 'high', `Outbound policy "${p.Name}" allows automatic external forwarding`, 'Any user, or an attacker in a compromised account, can forward all mail outside the company.', 'Set automatic forwarding to Off and allow it only for named people in a separate policy.');
    else if (p.AutoForwardingMode) add(a, 'ok', `Outbound policy "${p.Name}" forwarding is ${p.AutoForwardingMode}`, /automatic/i.test(p.AutoForwardingMode) ? 'Automatic means off: external auto-forwarding is blocked.' : 'External auto-forwarding is blocked.');
    if (Number(p.RecipientLimitExternalPerHour) === 0 && yes(p.IsDefault)) add(a, 'info', 'Outbound recipient limits use service defaults', 'A compromised account is stopped by the service limit, not a lower limit you choose.', 'Consider an external hourly limit for the default policy.');
  }
  for (const r of arr(s.remote)) {
    if (yes(r.AutoForwardEnabled) && r.DomainName !== '*') add(a, 'info', `Remote domain ${r.DomainName} allows auto-forwarding`, 'Forwarding to this domain is permitted if the outbound policy also allows it.');
    if (r.DomainName === '*' && yes(r.AutoForwardEnabled)) add(a, 'low', 'The Default remote domain allows auto-forwarding', 'The outbound spam policy is the control that matters, but both should say no.', 'Turn off automatic forwarding on the Default remote domain.');
  }
  const fwd = arr(recipients?.forwarding);
  const external = fwd.filter(m => m.ForwardingSmtpAddress);
  if (external.length) add(a, 'high', `${external.length} mailbox${external.length === 1 ? ' forwards' : 'es forward'} by SMTP address`, `${list(external.map(m => `${m.PrimarySmtpAddress} to ${String(m.ForwardingSmtpAddress).replace(/^smtp:/i, '')}`), 5)}. SMTP forwarding usually goes outside the company, which is the first thing to check after an account compromise.`, 'Confirm each one with the owner and the manager. Remove any nobody can explain.');
  else if (recipients && !recipients.errors?.forwarding) add(a, 'ok', 'No mailbox forwards by SMTP address', 'No mailbox-level forwarding to an outside address was found.');
  return a;
}

// ---- Authentication and modern auth
function reviewAuth(s, errors, compliance) {
  const a = area('modern-auth', 'Authentication and modern authentication', ['auth-policies', 'conditional-access'], ['org', 'transport', 'auth']);
  deniedFor(a, errors);
  const org = arr(s.org)[0];
  if (org && no(org.OAuth2ClientProfileEnabled)) add(a, 'high', 'Modern authentication is off for Outlook', 'Outlook falls back to legacy prompts, and Conditional Access and MFA cannot apply to it.', 'Set-OrganizationConfig -OAuth2ClientProfileEnabled $true, after a change request.');
  else if (org) add(a, 'ok', 'Modern authentication is on', 'Outlook uses OAuth, so MFA and Conditional Access apply.');
  const t = arr(s.transport)[0];
  if (t && !yes(t.SmtpClientAuthenticationDisabled)) add(a, 'medium', 'SMTP AUTH is allowed for the whole organization', 'Devices and apps can send with a username and password, a common target for password spray.', 'Disable it for the organization and allow it only on the mailboxes of devices that still need it (Set-CASMailbox -SmtpClientAuthenticationDisabled $false).');
  else if (t) add(a, 'ok', 'SMTP AUTH is off for the organization', 'Only mailboxes with a per-mailbox exception can use it.');
  for (const p of arr(s.auth)) {
    const basic = ['Smtp', 'Pop', 'Imap', 'ActiveSync'].filter(k => yes(p[`AllowBasicAuth${k}`]));
    if (basic.length) add(a, 'medium', `Authentication policy "${p.Name}" allows basic auth for ${basic.join(', ')}`, 'Basic authentication sends a password with every request and cannot do MFA. Microsoft has retired it for most protocols.', 'Remove basic auth from the policy, then move the remaining clients to OAuth.');
  }
  if (org && !org.DefaultAuthenticationPolicy && arr(s.auth).length) add(a, 'info', 'No default authentication policy is set', 'Policies apply only to users they are assigned to.');
  const ca = Array.isArray(compliance?.ca) ? compliance.ca : Array.isArray(compliance?.ca?.value) ? compliance.ca.value : null;
  if (ca) {
    const covers = p => /enabled/i.test(p.state || '') && !/report/i.test(p.state || '') && arr(p.applications).some(x => /^(all|office ?365|00000002-0000-0ff1-ce00-000000000000)$/i.test(x));
    const mfa = ca.filter(p => covers(p) && /mfa|multifactor|authenticationStrength/i.test(p.grant || ''));
    const legacy = ca.filter(p => covers(p) && /block/i.test(p.grant || '') && arr(p.clientAppTypes).some(c => /exchangeActiveSync|other/i.test(c)));
    add(a, mfa.length ? 'ok' : 'medium', mfa.length ? `MFA is required for Exchange by ${list(mfa.map(p => p.name))}` : 'No Conditional Access policy requires MFA for Exchange Online', mfa.length ? 'Sign-ins to Exchange need a second factor.' : 'A stolen password is enough to open mail.', mfa.length ? '' : 'Create a Conditional Access policy for Office 365 that requires MFA, in report-only first.');
    add(a, legacy.length ? 'ok' : 'low', legacy.length ? `Legacy authentication is blocked by ${list(legacy.map(p => p.name))}` : 'No Conditional Access policy blocks legacy authentication', legacy.length ? 'Old protocols cannot sign in.' : 'Microsoft has turned basic auth off for most protocols, but a block policy also covers SMTP AUTH and anything left.', legacy.length ? '' : 'Create a policy for client apps "Exchange ActiveSync" and "Other clients" with Block.');
  } else if (compliance?.ca?.label) a.findings.push({ severity: 'info', label: compliance.ca.label, title: 'Conditional Access could not be read', why: compliance.ca.message || '' });
  return a;
}

// ---- Recipients
function reviewRecipients(recipients) {
  const a = area('recipients', 'Groups, shared and resource mailboxes', ['groups', 'mailboxes', 'resources'], []);
  if (!recipients) { add(a, 'info', 'Recipients were not read', 'Open the Recipients page to read groups, shared and resource mailboxes.'); return a; }
  for (const [name, e] of Object.entries(recipients.errors || {})) a.findings.push({ severity: 'info', label: e.label, title: `${name} could not be read`, why: e.message || '' });
  const shared = arr(recipients.shared);
  const signIn = shared.filter(m => m.AccountEnabled === true);
  if (signIn.length) add(a, 'medium', `${signIn.length} shared mailbox${signIn.length === 1 ? ' allows' : 'es allow'} direct sign-in`, `${list(signIn.map(m => m.PrimarySmtpAddress))}. A shared mailbox has a password nobody owns. If sign-in is allowed it can be password-sprayed.`, 'Block sign-in on the user object in the Microsoft 365 admin center.');
  else if (shared.some(m => m.AccountEnabled === false)) add(a, 'ok', 'Shared mailboxes block direct sign-in', 'People reach them through delegation only.');
  const orphan = shared.filter(m => m.FullAccessCount === 0);
  if (orphan.length) add(a, 'low', `${orphan.length} shared mailbox${orphan.length === 1 ? ' has' : 'es have'} nobody with Full Access`, `${list(orphan.map(m => m.PrimarySmtpAddress))}. Mail may be arriving where nobody reads it.`, 'Find an owner or convert, archive and remove it.');
  const noCopy = shared.filter(m => no(m.MessageCopyForSentAsEnabled));
  if (noCopy.length) add(a, 'info', `${noCopy.length} shared mailbox${noCopy.length === 1 ? ' keeps' : 'es keep'} Send As items only in the sender's Sent Items`, 'Others in the team cannot see what was sent.', 'Set MessageCopyForSentAsEnabled if the team expects a shared Sent Items.');
  for (const r of arr(recipients.resources)) {
    const cal = r.Calendar;
    if (!cal) continue;
    if (!/autoaccept/i.test(cal.AutomateProcessing || '')) add(a, 'low', `${r.DisplayName} does not auto-accept bookings (${cal.AutomateProcessing})`, 'Meeting requests wait for a delegate or are not processed, the most common "room never answers" ticket.', 'Set AutomateProcessing to AutoAccept, or confirm a delegate approves requests.');
    if (yes(cal.AllowConflicts)) add(a, 'low', `${r.DisplayName} allows double booking`, 'Two meetings can hold the room at once.', 'Turn off AllowConflicts unless that is intended.');
    if (!yes(cal.AllBookInPolicy) && !arr(cal.BookInPolicy).length && !yes(cal.AllRequestInPolicy)) add(a, 'medium', `${r.DisplayName} accepts bookings from nobody`, 'AllBookInPolicy is off and no one is listed in BookInPolicy, so every request is declined.', 'Turn on AllBookInPolicy or list who may book.');
  }
  const groups = arr(recipients.groups);
  const unowned = groups.filter(g => !arr(g.ManagedBy).length);
  if (unowned.length) add(a, 'low', `${unowned.length} distribution group${unowned.length === 1 ? ' has' : 's have'} no owner`, `${list(unowned.map(g => g.PrimarySmtpAddress))}. Nobody approves membership or retires the group.`, 'Assign an owner on each group.');
  const open = groups.filter(g => no(g.RequireSenderAuthenticationEnabled) && Number(g.MemberCount) >= 25);
  if (open.length) add(a, 'medium', `${open.length} large group${open.length === 1 ? ' accepts' : 's accept'} mail from outside`, `${list(open.map(g => `${g.PrimarySmtpAddress} (${g.MemberCount} members)`))}. Anyone on the internet can mail everyone in it.`, 'Require senders to be authenticated unless outside mail is the point of the group.');
  const m365 = arr(recipients.m365);
  const pub = m365.filter(g => /public/i.test(g.AccessType || ''));
  if (pub.length) add(a, 'info', `${pub.length} Microsoft 365 group${pub.length === 1 ? ' is' : 's are'} public`, `${list(pub.map(g => g.PrimarySmtpAddress))}. Anyone in the organization can join and read the group mailbox.`, 'Confirm public is intended.');
  if (!a.findings.length) add(a, 'ok', 'No problems found in groups and shared or resource mailboxes', '');
  return a;
}

// ---- Retention, MRM and mailbox policies
function reviewRetention(s, errors, compliance) {
  const a = area('retention', 'Retention and mailbox policies', ['retention', 'retention-purview', 'owa-mobile'], ['retention', 'retentionTags', 'owa', 'sharing']);
  deniedFor(a, errors);
  const mrm = arr(s.retention);
  const def = mrm.find(p => yes(p.IsDefault));
  if (mrm.length) add(a, 'info', `Default MRM policy: ${def ? def.Name : 'none marked default'}`, `${mrm.length} Exchange retention (MRM) polic${mrm.length === 1 ? 'y' : 'ies'}. MRM moves mail to the archive or deletes it; it does not preserve mail.`);
  const tags = arr(s.retentionTags);
  for (const t of tags) if (/^all$/i.test(t.Type || '') && /delete/i.test(t.RetentionAction || '') && yes(t.RetentionEnabled)) add(a, 'medium', `Default tag "${t.Name}" deletes mail`, `Every item without another tag is deleted after ${t.AgeLimitForRetention}. Users notice this as missing mail.`, 'Confirm this matches the records policy, or change the action to MoveToArchive.');
  const purview = Array.isArray(compliance?.retentionPolicies) ? compliance.retentionPolicies : null;
  if (purview) {
    const mail = purview.filter(p => arr(p.locations).some(l => /exchange/i.test(l)) && !/disable/i.test(p.mode || '') && p.enabled !== false);
    add(a, mail.length ? 'ok' : 'medium', mail.length ? `Purview retention covers mail: ${list(mail.map(p => p.name))}` : 'No Purview retention policy covers Exchange', mail.length ? 'Deleted mail is preserved for the policy duration.' : 'Users can permanently delete mail and it is gone after the deleted items window. Legal and records requests then fail.', mail.length ? '' : 'Agree a retention period with legal and create a retention policy for Exchange mailboxes.');
    for (const p of purview) if (p.distribution && !/success/i.test(p.distribution)) add(a, 'medium', `Retention policy "${p.name}" is ${p.distribution}`, 'The policy is not fully deployed to the locations it names.', 'Open it in Purview, check the distribution detail, and retry distribution.');
  } else if (compliance?.retentionPolicies?.label) a.findings.push({ severity: 'info', label: compliance.retentionPolicies.label, title: 'Purview retention could not be read', why: compliance.retentionPolicies.message || '' });
  for (const p of arr(s.sharing)) if (yes(p.Enabled) && arr(p.Domains).some(d => /^anonymous:/i.test(d))) add(a, 'low', `Sharing policy "${p.Name}" allows anonymous calendar publishing`, 'Users can publish a calendar link anyone can open.', 'Remove Anonymous from the policy if it is not needed.');
  for (const p of arr(s.owa)) if (yes(p.AdditionalStorageProvidersAvailable)) add(a, 'low', `Outlook on the web policy "${p.Name}" allows other storage providers`, 'Users can attach files from personal Dropbox or Google Drive.', 'Turn off AdditionalStorageProvidersAvailable.');
  return a;
}

// ---- Purview DLP, labels, eDiscovery, audit
function reviewPurview(s, errors, compliance) {
  const a = area('purview', 'Purview: DLP, labels, eDiscovery and audit', ['dlp', 'labels', 'ediscovery', 'audit'], ['auditConfig', 'org']);
  deniedFor(a, errors);
  const audit = arr(s.auditConfig)[0];
  if (audit && no(audit.UnifiedAuditLogIngestionEnabled)) add(a, 'high', 'Unified audit logging is off', 'No record of who read, sent, deleted or changed anything. Investigations have nothing to search.', 'Turn on auditing in the Purview portal, Audit. It takes up to 60 minutes.');
  else if (audit) add(a, 'ok', 'Unified audit logging is on', 'Audit search works.');
  const org = arr(s.org)[0];
  if (org && yes(org.AuditDisabled)) add(a, 'high', 'Mailbox auditing is off for the organization', 'Mailbox actions such as MailItemsAccessed and Send are not logged.', 'Set-OrganizationConfig -AuditDisabled $false.');
  if (!compliance) return a;
  const dlp = Array.isArray(compliance.dlp) ? compliance.dlp : null;
  if (dlp) {
    const mail = dlp.filter(p => arr(p.workloads).some(w => /exchange/i.test(w)));
    if (!mail.length) add(a, 'medium', 'No DLP policy covers Exchange', 'Sensitive data such as card numbers can be emailed outside without a tip or a block.', 'Start a DLP policy from a template (for example U.S. Financial Data) for Exchange in test mode with policy tips.');
    for (const p of mail) {
      if (/test/i.test(p.mode || '')) add(a, 'info', `DLP "${p.name}" is in test mode`, `${p.mode}: matches are logged${/notification/i.test(p.mode) ? ' and the sender sees a policy tip' : ''}, nothing is blocked.`, 'Review matches in Activity explorer, then turn it on.');
      if (p.distribution && !/success/i.test(p.distribution)) add(a, 'medium', `DLP "${p.name}" distribution is ${p.distribution}`, 'A policy that has not finished distributing does not act on mail, which looks like "the policy does nothing".', 'Open the policy in Purview and check the distribution status. Redistribute if it failed.');
      if (p.enabled === false || /disable/i.test(p.mode || '')) add(a, 'low', `DLP "${p.name}" is turned off`, 'It does not evaluate mail.');
    }
    for (const r of arr(Array.isArray(compliance.dlpRules) ? compliance.dlpRules : [])) {
      if (r.disabled) add(a, 'low', `DLP rule "${r.name}" is disabled`, `Its policy (${r.policy}) runs without it.`);
      if (r.blocks && !arr(r.notifyUser).length) add(a, 'low', `DLP rule "${r.name}" blocks without a user notification`, 'The sender gets only a bounce and does not know why. This becomes a help desk ticket.', 'Add a user notification or policy tip.');
    }
  } else if (compliance.dlp?.label) a.findings.push({ severity: 'info', label: compliance.dlp.label, title: 'DLP could not be read', why: compliance.dlp.message || '' });
  const labels = Array.isArray(compliance.labels) ? compliance.labels : null;
  const labelPolicies = Array.isArray(compliance.labelPolicies) ? compliance.labelPolicies : null;
  if (labels && !labels.length) add(a, 'info', 'No sensitivity labels are defined', 'Users cannot classify or encrypt mail with labels.');
  if (labels && labels.length && labelPolicies && !labelPolicies.length) add(a, 'medium', 'Labels exist but no label policy publishes them', 'Users do not see the labels in Outlook.', 'Create a label policy that publishes the labels to users.');
  for (const p of arr(labelPolicies)) if (p.distribution && !/success/i.test(p.distribution)) add(a, 'medium', `Label policy "${p.name}" is ${p.distribution}`, 'Users in scope may not see the labels yet.');
  const cases = Array.isArray(compliance.cases) ? compliance.cases : null;
  if (cases) add(a, 'info', `${cases.length} eDiscovery case${cases.length === 1 ? '' : 's'}`, cases.length ? `${list(cases.map(c => `${c.name}${c.status ? ` (${c.status})` : ''}`))}. A hold in an active case preserves mail even after users delete it.` : 'No cases.');
  return a;
}

// ---- Quarantine
function reviewQuarantine(s, errors) {
  const a = area('quarantine', 'Quarantine policies', ['quarantine'], ['quarantine']);
  deniedFor(a, errors);
  const q = arr(s.quarantine);
  const notify = q.filter(p => yes(p.ESNEnabled));
  if (q.length && !notify.length) add(a, 'low', 'Users get no quarantine notifications', 'People only learn mail was quarantined when they ask the help desk.', 'Turn on notifications in the quarantine policy used for spam (for example DefaultFullAccessWithNotificationPolicy).');
  if (q.length) add(a, 'info', `${q.length} quarantine polic${q.length === 1 ? 'y' : 'ies'}`, list(q.map(p => `${p.Name}${Number(p.EndUserQuarantinePermissionsValue) === 0 ? ' (admin only)' : ''}`)));
  return a;
}

function reviewHealth(health) {
  const a = area('health', 'Service health', ['service-health'], []);
  if (!health) return a;
  if (health.label) { a.findings.push({ severity: 'info', label: health.label, title: 'Service health could not be read', why: health.message || '' }); return a; }
  const services = arr(health.services);
  const bad = services.filter(sv => /exchange|defender|office 365|purview|microsoft 365/i.test(sv.service || sv.name || '') && sv.status && !/operational/i.test(sv.status));
  for (const sv of bad) add(a, 'high', `${sv.service || sv.name}: ${sv.status}`, 'Microsoft reports a problem with this service right now. Check it before troubleshooting the tenant.', 'Read the open issue in Service health and link it in the ticket.');
  if (services.length && !bad.length) add(a, 'ok', 'Exchange Online and Defender report healthy', '');
  for (const i of arr(health.issues).slice(0, 5)) add(a, 'info', i.title || i.id, `Status: ${i.status || 'open'}.`);
  return a;
}

export function reviewTenant({ settings = {}, errors = {}, domains = [], compliance = null, recipients = null, health = null, defender = true } = {}) {
  const areas = [
    reviewHealth(health),
    reviewDomains(settings, errors, domains),
    reviewRules(settings, errors),
    reviewConnectors(settings, errors, domains),
    reviewSpam(settings, errors),
    reviewPhish(settings, errors, defender),
    reviewDefender(settings, errors, defender),
    reviewOutbound(settings, errors, recipients),
    reviewAuth(settings, errors, compliance),
    reviewRecipients(recipients),
    reviewRetention(settings, errors, compliance),
    reviewPurview(settings, errors, compliance),
    reviewQuarantine(settings, errors),
  ].filter(a => a.findings.length);
  for (const a of areas) a.findings.sort((x, y) => SEVERITY_ORDER.indexOf(x.severity) - SEVERITY_ORDER.indexOf(y.severity));
  const counts = Object.fromEntries(SEVERITY_ORDER.map(k => [k, 0]));
  for (const a of areas) for (const f of a.findings) counts[f.severity] += 1;
  return { areas, counts };
}
