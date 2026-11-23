// Which Purview and Conditional Access policies apply to one mailbox, and why.
// Office 365 Exchange Online's first-party app id, used by Conditional Access.
export const EXCHANGE_APP_ID = '00000002-0000-0ff1-ce00-000000000000';

const addr = mailbox => String(mailbox.primary || mailbox.address || '').toLowerCase();
const groups = mailbox => (mailbox.memberOf || []).flatMap(g => [g.id, g.name, g].filter(Boolean).map(v => String(v).toLowerCase()));

function listed(list, value) {
  return (list || []).some(item => String(item).toLowerCase() === String(value).toLowerCase());
}

function modeSentence(mode) {
  const value = String(mode || 'Enable');
  if (/test/i.test(value)) return `The policy mode is ${value}, so a match tips or logs and does not block.`;
  if (/disable/i.test(value)) return 'The policy is disabled, so it does not evaluate this mailbox.';
  return `The policy mode is ${value}, so a match can block or tip.`;
}

export function dlpForMailbox(policies, mailbox) {
  return (policies || []).map(policy => {
    const workloads = (policy.workloads || []).map(w => String(w).toLowerCase());
    if (!workloads.includes('exchange')) {
      return { ...policy, applies: false, why: 'This DLP policy does not include the Exchange workload.' };
    }
    if (/disable/i.test(policy.mode || '')) {
      return { ...policy, applies: false, why: modeSentence(policy.mode) };
    }
    const users = policy.users || [];
    const groupIds = policy.groups || [];
    const everyone = policy.scope === 'all' || (!users.length && !groupIds.length);
    const named = listed(users, addr(mailbox));
    const member = groups(mailbox).some(g => listed(groupIds, g));
    const applies = everyone || named || member;
    const scope = everyone ? 'It is scoped to every Exchange mailbox.'
      : named ? 'This mailbox is named on the policy.'
      : member ? 'This mailbox is in a group on the policy.'
      : 'This mailbox is not in the users or groups on the policy.';
    return { ...policy, applies, why: applies ? `The Exchange workload is included. ${scope} ${modeSentence(policy.mode)}` : `The Exchange workload is included. ${scope}` };
  });
}

export function retentionForMailbox(policies, mailbox) {
  return (policies || []).map(policy => {
    const locations = (policy.locations || []).map(l => String(l).toLowerCase());
    if (locations.length && !locations.includes('exchange')) {
      return { ...policy, applies: false, why: 'This retention policy does not include Exchange.' };
    }
    const excluded = listed(policy.exclude || [], addr(mailbox));
    if (excluded) return { ...policy, applies: false, why: 'This mailbox is excluded from the Exchange location.' };
    const users = policy.users || [];
    const everyone = !users.length || policy.scope === 'all';
    const named = listed(users, addr(mailbox));
    const applies = everyone || named;
    return {
      ...policy,
      applies,
      why: applies
        ? `Exchange is a location on this policy${named ? ' and this mailbox is included by name' : ' and it is not limited to a list that excludes this mailbox'}.`
        : 'Exchange is a location, but this mailbox is not in the included list.',
    };
  });
}

export function holdsForMailbox(cases, mailbox) {
  const rows = [];
  for (const item of cases || []) {
    for (const hold of item.holds || []) {
      const targets = (hold.mailboxes || []).map(m => String(m).toLowerCase());
      const applies = !targets.length || targets.includes(addr(mailbox));
      rows.push({
        case: item.name,
        hold: hold.name,
        applies,
        why: applies
          ? `${item.name} has hold ${hold.name}${targets.length ? ' and this mailbox is a custodian' : ' with no mailbox exclusion'}.`
          : `${hold.name} does not list this mailbox.`,
      });
    }
  }
  return rows;
}

export function caForMailbox(policies, mailbox) {
  return (policies || []).map(policy => {
    if (policy.state && policy.state !== 'enabled') {
      return { ...policy, applies: false, why: `The policy state is ${policy.state}, so it is not evaluated.` };
    }
    const apps = policy.applications || [];
    const allApps = !apps.length || apps.includes('All');
    const exchange = allApps || apps.some(app => String(app).toLowerCase() === EXCHANGE_APP_ID || /exchange|office 365/i.test(String(app)));
    if (!exchange) return { ...policy, applies: false, why: 'The included cloud apps do not contain Exchange Online or Office 365.' };
    const id = String(mailbox.id || '').toLowerCase();
    const primary = addr(mailbox);
    if ((policy.excludeUsers || []).some(u => [primary, id].includes(String(u).toLowerCase()))) {
      return { ...policy, applies: false, why: 'This user is excluded from the policy.' };
    }
    const include = policy.includeUsers || [];
    const everyone = include.includes('All') || (!include.length && !(policy.includeGroups || []).length);
    const named = include.some(u => [primary, id].includes(String(u).toLowerCase()));
    const member = groups(mailbox).some(g => listed(policy.includeGroups || [], g));
    const applies = everyone || named || member;
    return {
      ...policy,
      applies,
      why: applies
        ? `The policy is enabled and includes Exchange Online.${everyone ? ' It includes all users.' : ' This user is in the included users or groups.'}`
        : 'The policy includes Exchange Online, but this user is not in the included users or groups.',
    };
  });
}

export function alertsForMailbox(alerts, mailbox) {
  const primary = addr(mailbox);
  return (alerts || []).filter(alert => {
    const user = String(alert.user || alert.userPrincipalName || '').toLowerCase();
    return !user || user === primary;
  });
}
