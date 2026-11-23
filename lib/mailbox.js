import { policiesForMailbox, transportRulesForMailbox, connectorsForMailbox } from './scope.js';
import { licenseGap } from './licenses.js';
import { recipientType, KIND_WORDS } from './recipient-types.js';

const PROTOCOLS = [
  ['mapi', 'MAPI (Outlook)'],
  ['ews', 'Exchange Web Services'],
  ['activeSync', 'ActiveSync'],
  ['pop', 'POP'],
  ['imap', 'IMAP'],
  ['smtp', 'Authenticated SMTP'],
];

export function protocolRows(cas) {
  return PROTOCOLS.map(([id, name]) => ({ id, name, enabled: Boolean(cas?.[id]) }));
}

export function mailboxFindings(mailbox, policies, rules) {
  const findings = [];
  const add = (severity, title, detail) => findings.push({ severity, title, detail });
  const kind = mailbox.kind || recipientType(mailbox.type).kind;
  if (kind !== 'mailbox') {
    const g = mailbox.group;
    if (g && g.requireSenderAuth === false) add('medium', 'Anyone outside the organization can send to this group', 'Delivery management allows senders inside and outside the organization. If that is not intended, turn on "Only allow messages from people inside my organization".');
    if (g && g.acceptOnlyFrom?.length) add('info', 'Only some senders are allowed', `Only ${g.acceptOnlyFrom.join(', ')} can send to this group. Everyone else gets a non-delivery report (5.7.1).`);
    if (Array.isArray(mailbox.owners) && !mailbox.owners.length) add('low', 'This group has no owner', 'Nobody can manage membership or approve requests without an admin.');
    if (Array.isArray(mailbox.members) && !mailbox.members.length && mailbox.type !== 'DynamicDistributionGroup') add('medium', 'This group has no members', 'Mail sent to it is accepted and then reaches nobody.');
    if (mailbox.externalAddress) add('info', 'Mail goes outside Exchange Online', `Mail to ${mailbox.primary} is delivered to ${mailbox.externalAddress}. Outbound spam policy and remote domain settings apply to it.`);
    if (mailbox.hidden) add('info', 'Hidden from the address lists', 'People cannot find it in the global address list, but mail sent to its address is still delivered.');
    const disabled = (rules || []).find(r => r.state === 'Disabled' && r.wouldMatch);
    if (disabled) add('info', `Rule "${disabled.name}" would match but is disabled`, disabled.why);
    if (!findings.length) add('info', `Nothing urgent on this ${KIND_WORDS[kind]}`, 'Delivery is limited to the organization and nothing unusual is set.');
    return findings;
  }
  if (mailbox.forwarding?.smtp) add(mailbox.forwarding.deliverAndForward ? 'medium' : 'high', 'Mailbox forwarding is on', `Mail is forwarded to ${mailbox.forwarding.smtp}${mailbox.forwarding.deliverAndForward ? ' and also kept' : ' and not kept'}. Outbound policy can still block this with NDR 5.7.520.`);
  for (const rule of mailbox.inboxRules || []) {
    if (/forward|redirect/i.test(rule.description || '')) add('medium', `Inbox rule "${rule.name}" forwards`, rule.description);
  }
  if (mailbox.litigationHold) add('info', 'Litigation hold is on', 'Content is kept even if the user deletes it. This needs Exchange Online Plan 2.');
  if (mailbox.retentionHold) add('info', 'Retention hold is on', 'MRM is paused on this mailbox.');
  if (mailbox.cas && mailbox.cas.pop) add('low', 'POP is enabled', 'POP downloads mail and is a common place for a forgotten client to keep a password.');
  if (mailbox.cas && mailbox.cas.smtp) add('low', 'Authenticated SMTP is enabled on this mailbox', 'Organization SMTP AUTH can still be off. Both have to allow it before a device can send.');
  const disabledRule = (rules || []).find(r => r.state === 'Disabled' && r.wouldMatch);
  if (disabledRule) add('info', `Rule "${disabledRule.name}" would match but is disabled`, disabledRule.why);
  if (policies.policies?.safeLinks?.unavailable) add('info', 'Safe Links is not licensed', policies.policies.safeLinks.why);
  if (!findings.length) add('info', 'Nothing urgent on this mailbox', 'Forwarding is off, and the protocols that are enabled are the usual Outlook set.');
  return findings;
}

export function buildMailboxView(org, mailbox) {
  if (!mailbox) return null;
  const policies = policiesForMailbox(org, mailbox);
  const rules = transportRulesForMailbox(org.transportRules || [], mailbox);
  const connectors = connectorsForMailbox(org.connectors || [], mailbox);
  const gap = org.skus ? licenseGap(org.skus, 'safe-links') : null;
  const type = recipientType(mailbox.type);
  mailbox = { ...mailbox, kind: mailbox.kind || type.kind, typeLabel: mailbox.typeLabel || type.label };
  return {
    mailbox,
    protocols: protocolRows(mailbox.cas),
    policies,
    rules,
    connectors,
    findings: mailboxFindings(mailbox, policies, rules),
    licenseGap: gap,
  };
}
