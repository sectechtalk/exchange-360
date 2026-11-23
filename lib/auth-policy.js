// Protocols > Authentication policy, in plain words. Exchange returns a blank AuthenticationPolicy on the user
// when none is assigned to them; then the organization default (Get-OrganizationConfig
// DefaultAuthenticationPolicy) applies, and when that is blank too, no authentication policy applies at all.
// Learn: exchange/clients-and-mobile-in-exchange-online/disable-basic-authentication-in-exchange-online.
export function authPolicyWords({ user = '', userError = null, orgDefault = null, orgError = null } = {}) {
  if (userError) return { tone: 'warn', label: 'Could not read', text: `Ex360 could not read this user's authentication policy: ${userError.message || userError}` };
  if (user) return { tone: 'info', label: user, text: `The authentication policy "${user}" is assigned to this user. It wins over the organization default.` };
  if (orgError) return { tone: 'warn', label: 'None assigned to this user', text: `No authentication policy is assigned to this user, so the organization default applies. Ex360 could not read the default: ${orgError.message || orgError}` };
  if (orgDefault) return { tone: 'info', label: `${orgDefault} (organization default)`, text: `No authentication policy is assigned to this user, so the organization default "${orgDefault}" applies.` };
  if (orgDefault === '') return { tone: 'ok', label: 'None', text: 'No authentication policy is assigned to this user and the organization has no default, so none applies. That is normal: an authentication policy only blocks basic (legacy) authentication, and Microsoft has already turned basic authentication off in Exchange Online for almost every protocol.' };
  return { tone: 'info', label: 'None assigned to this user', text: 'No authentication policy is assigned to this user, so the organization default applies, if the organization has one. Org config shows the default.' };
}
