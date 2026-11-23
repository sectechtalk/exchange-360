// Does the signed-in person's Exchange role let them make the change a Single recipient page links to?
// Connect-ExchangeOnline loads only the cmdlets and parameters the person's RBAC roles allow, so Ex360 asks
// Get-Command whether each one is there. Nothing is run. A management scope can still limit WHICH
// recipients the cmdlet works on; Role assignments and scopes shows those.
export const CHANGE_RIGHTS = {
  'mb-forward': { what: 'change this mailbox\'s forwarding', checks: [{ cmdlet: 'Set-Mailbox', params: ['ForwardingSmtpAddress', 'DeliverToMailboxAndForward'] }] },
  'mb-rules': { what: 'change, turn off or remove this mailbox\'s inbox rules', checks: [{ cmdlet: 'Set-InboxRule', params: [] }, { cmdlet: 'Disable-InboxRule', params: [] }, { cmdlet: 'Remove-InboxRule', params: [] }] },
  'mb-groups': { what: 'add or remove this recipient from groups', checks: [{ cmdlet: 'Add-DistributionGroupMember', params: [] }, { cmdlet: 'Remove-DistributionGroupMember', params: [] }, { cmdlet: 'Add-UnifiedGroupLinks', params: [] }] },
  'mb-delegation': { what: 'grant or remove Full Access, Send As and Send on Behalf', checks: [{ cmdlet: 'Add-MailboxPermission', params: [] }, { cmdlet: 'Add-RecipientPermission', params: [] }, { cmdlet: 'Set-Mailbox', params: ['GrantSendOnBehalfTo'] }] },
  'mb-protocols': { what: 'turn client protocols on or off and assign an authentication policy', checks: [{ cmdlet: 'Set-CASMailbox', params: [] }, { cmdlet: 'Set-User', params: ['AuthenticationPolicy'] }] },
};

export const ALL_CHANGE_CHECKS = (() => {
  const seen = new Map();
  for (const page of Object.values(CHANGE_RIGHTS)) for (const c of page.checks) {
    const prior = seen.get(c.cmdlet) || [];
    seen.set(c.cmdlet, [...new Set([...prior, ...c.params])]);
  }
  return [...seen].map(([cmdlet, params]) => ({ cmdlet, params }));
})();

// rows: [{ cmdlet, available, missing: [param] }] from the PowerShell 'rights' mode.
export function rightsVerdict(pageId, rows) {
  const page = CHANGE_RIGHTS[pageId];
  if (!page || !Array.isArray(rows)) return null;
  const byName = new Map(rows.map(r => [String(r.cmdlet).toLowerCase(), r]));
  const lines = page.checks.map(c => {
    const r = byName.get(c.cmdlet.toLowerCase());
    const missing = r ? c.params.filter(x => (r.missing || []).map(m => String(m).toLowerCase()).includes(x.toLowerCase())) : c.params;
    const ok = Boolean(r?.available) && !missing.length;
    const label = c.params.length ? `${c.cmdlet} -${c.params.join(', -')}` : c.cmdlet;
    return { label, ok, why: !r?.available ? 'not in your Exchange role' : missing.length ? `your role has ${c.cmdlet} but not -${missing.join(', -')}` : 'in your Exchange role' };
  });
  const allowed = lines.filter(l => l.ok).length;
  const verdict = allowed === lines.length ? 'yes' : allowed ? 'partly' : 'no';
  const words = verdict === 'yes' ? `Your Exchange role lets you ${page.what}.`
    : verdict === 'partly' ? `Your Exchange role lets you do part of this: ${page.what}.`
      : `Your Exchange role does not let you ${page.what}. Ask an Exchange admin.`;
  return { verdict, words, lines };
}
