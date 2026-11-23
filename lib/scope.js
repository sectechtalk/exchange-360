// Which Exchange policy applies to one mailbox, and why.
// Preset security policies (Strict, then Standard) win over custom rules.
// Custom anti-spam, anti-phish, Safe Links and Safe Attachments rules then run in priority order
// (lower number first). The first match wins. If nothing matches, the built-in default applies.
// Transport rules are different: every matching rule runs, in priority order, unless a rule stops processing.

const ADDR = mailbox => String(mailbox.primary || mailbox.address || '').toLowerCase();
const DOMAIN = mailbox => (ADDR(mailbox).split('@')[1] || '').toLowerCase();
const GROUPS = mailbox => new Set((mailbox.memberOf || []).map(g => String(g.id || g.name || g).toLowerCase()));

function listed(list, value) {
  return (list || []).some(item => String(item).toLowerCase() === value);
}

export function ruleMatches(rule, mailbox) {
  const address = ADDR(mailbox);
  const domain = DOMAIN(mailbox);
  const groups = GROUPS(mailbox);
  const reasons = [];
  const miss = [];
  const sentTo = rule.sentTo || [];
  const memberOf = rule.sentToMemberOf || [];
  const domains = rule.recipientDomainIs || [];
  const exceptTo = rule.exceptIfSentTo || [];
  const exceptGroup = rule.exceptIfSentToMemberOf || [];
  const exceptDomain = rule.exceptIfRecipientDomainIs || [];
  if (listed(exceptTo, address)) return { match: false, why: `Excepted because the mailbox ${address} is in the exception list.` };
  if ([...groups].some(g => listed(exceptGroup, g))) return { match: false, why: 'Excepted because the mailbox is in an excepted group.' };
  if (listed(exceptDomain, domain)) return { match: false, why: `Excepted because the domain ${domain} is excluded.` };
  const scoped = sentTo.length || memberOf.length || domains.length;
  if (!scoped) {
    reasons.push('The rule has no recipient scope, so it applies to every mailbox it is evaluated for.');
  } else {
    if (listed(sentTo, address)) reasons.push(`The mailbox ${address} is named on the rule.`);
    const hit = [...groups].filter(g => listed(memberOf, g));
    if (hit.length) reasons.push(`The mailbox is a member of ${hit.join(', ')}.`);
    if (listed(domains, domain)) reasons.push(`The recipient domain ${domain} is in scope.`);
    if (!reasons.length) miss.push('The mailbox is not in the recipients, groups or domains on this rule.');
  }
  const inScope = reasons.length > 0 && !miss.some(m => m.startsWith('The mailbox') || m.startsWith('Excepted'));
  if (rule.state && rule.state !== 'Enabled') miss.push(`The rule is ${rule.state}.`);
  const enabled = !rule.state || rule.state === 'Enabled';
  return {
    match: enabled && inScope && miss.every(m => m.startsWith('The rule is')),
    inScope,
    why: miss.find(m => !m.startsWith('The rule is')) || (inScope ? `${reasons.join(' ')}${enabled ? '' : ` The rule is ${rule.state}.`}` : 'The mailbox is not in scope.'),
  };
}

export function firstMatchingPolicy(rules, mailbox, kind) {
  const enabled = (rules || []).filter(r => !r.state || r.state === 'Enabled');
  const ordered = [...enabled].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
  for (const rule of ordered) {
    const result = ruleMatches(rule, mailbox);
    if (result.match) {
      return {
        applies: rule.policy || rule.name,
        rule: rule.name,
        priority: rule.priority ?? null,
        why: `${kind}: ${result.why} It is priority ${rule.priority ?? 0}, the first matching enabled rule.`,
        kind,
      };
    }
  }
  return { applies: 'Built-in default', rule: null, priority: null, why: `${kind}: no enabled custom rule includes this mailbox, so the built-in default policy applies.`, kind };
}

export function presetWinner(presets, mailbox) {
  for (const name of ['Strict', 'Standard']) {
    const preset = (presets || []).find(p => p.name === name);
    if (!preset) continue;
    if (preset.applyToAll) {
      return { name, why: `${name} preset is set for the whole organization. Preset policies run before custom policies, and Strict wins over Standard.` };
    }
    const hasScope = (preset.sentTo || []).length || (preset.sentToMemberOf || []).length || (preset.domains || []).length;
    const scoped = ruleMatches({
      sentTo: preset.sentTo, sentToMemberOf: preset.sentToMemberOf, recipientDomainIs: preset.domains, state: 'Enabled',
    }, mailbox);
    if (hasScope && scoped.match) {
      return { name, why: `${name} preset security policy includes this mailbox. ${scoped.why} Preset policies are evaluated before custom policies, and Strict wins over Standard.` };
    }
  }
  return null;
}

export function policiesForMailbox(org, mailbox) {
  const preset = presetWinner(org.presets || [], mailbox);
  const kinds = [
    ['antiSpam', 'Anti-spam'],
    ['antiPhish', 'Anti-phish'],
    ['safeLinks', 'Safe Links'],
    ['safeAttachments', 'Safe Attachments'],
  ];
  const policies = {};
  for (const [key, label] of kinds) {
    if (preset && (key === 'antiSpam' || key === 'antiPhish' || org.defender)) {
      policies[key] = { applies: `${preset.name} preset`, rule: preset.name, why: preset.why, kind: label, license: key.startsWith('safe') ? 'defender' : null };
    } else if ((key === 'safeLinks' || key === 'safeAttachments') && !org.defender) {
      policies[key] = {
        applies: null,
        unavailable: true,
        license: 'Microsoft Defender for Office 365 Plan 1',
        why: `${label} is part of Microsoft Defender for Office 365 Plan 1 (also included with Microsoft 365 E5). This tenant snapshot does not show that license, so there is no policy to apply.`,
        kind: label,
      };
    } else {
      policies[key] = firstMatchingPolicy(org[key] || [], mailbox, label);
    }
  }
  const quarantine = firstMatchingPolicy(org.quarantine || [], mailbox, 'Quarantine');
  return { preset, policies, quarantine };
}

export function transportRulesForMailbox(rules, mailbox) {
  const ordered = [...(rules || [])].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
  const out = [];
  for (const rule of ordered) {
    const result = ruleMatches(rule, mailbox);
    out.push({
      name: rule.name,
      priority: rule.priority ?? null,
      state: rule.state || 'Enabled',
      applies: result.match,
      wouldMatch: Boolean(result.inScope),
      why: result.why,
      stop: Boolean(rule.stopProcessing),
      actions: rule.actions || [],
    });
    if (result.match && rule.stopProcessing) break;
  }
  return out;
}

export function connectorsForMailbox(connectors, mailbox) {
  const domain = DOMAIN(mailbox);
  return (connectors || []).map(c => {
    const direction = c.direction || (c.senderDomains ? 'inbound' : 'outbound');
    const senders = (c.senderDomains || []).map(d => String(d).replace(/^\*\./, '').toLowerCase());
    const recipients = (c.recipientDomains || []).map(d => String(d).replace(/^\*\./, '').toLowerCase());
    const matches = list => list.length === 0 || list.includes('*') || list.some(d => domain === d || domain.endsWith(`.${d}`));
    // An inbound connector's sender domains describe the remote side. It applies to this mailbox
    // when the mailbox's domain is an accepted recipient, or the connector names no recipient limit.
    const hit = direction === 'inbound' ? matches(recipients) : matches(recipients.length ? recipients : senders);
    const why = direction === 'inbound'
      ? (hit ? `Inbound connector "${c.name}" can deliver into ${domain} when the sender matches ${senders.join(', ') || 'the connector source'}.` : `Inbound connector "${c.name}" does not deliver to ${domain}.`)
      : (hit ? `Outbound connector "${c.name}" can send mail from ${domain} toward ${recipients.join(', ') || 'its remote domains'}.` : `Outbound connector "${c.name}" is scoped to other domains.`);
    return { name: c.name, direction, enabled: c.enabled !== false, applies: hit && c.enabled !== false, why, tls: c.tls || '' };
  });
}
