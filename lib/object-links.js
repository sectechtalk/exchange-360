// Links from one object in an Ex360 table to every Microsoft portal where that object can be changed.
// Design rule: link to the portals that modify the object, not to Graph. When a portal can open the
// object directly (by its ID or name in the URL) the link goes straight there. When it cannot, the link opens that
// portal's page for that kind of object and says "find <name> here" (his choice on 2026-11-22).
// Pure: no DOM, so tests can check every URL.

const M365 = 'https://admin.cloud.microsoft';
const ENTRA = 'https://entra.microsoft.com';
const AZURE = 'https://portal.azure.com';
const INTUNE = 'https://intune.microsoft.com';
const EAC = 'https://admin.exchange.microsoft.com';
const DEFENDER = 'https://security.microsoft.com';
const PURVIEW = 'https://purview.microsoft.com';
const TEAMS = 'https://admin.teams.microsoft.com';

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isGuid = value => GUID.test(String(value || '').trim());
const enc = value => encodeURIComponent(String(value).trim());

// short: the chip text on the row. name: the full tooltip. direct: true when the URL opens this object itself.
const direct = (short, name, url) => ({ short, name, url, direct: true });
const find = (short, page, url) => ({ short, page, url, direct: false });

// Portal pages for each kind of object, used when a portal has no direct link to one object.
export const FIND_PAGES = {
  mailbox: [find('Exchange admin center', 'Recipients > Mailboxes', `${EAC}/#/mailboxes`)],
  resource: [find('Exchange admin center', 'Recipients > Resources', `${EAC}/#/resources`)],
  group: [find('Exchange admin center', 'Recipients > Groups', `${EAC}/#/groups`)],
  dynamicGroup: [find('Exchange admin center', 'Recipients > Groups > Dynamic distribution list', `${EAC}/#/groups`)],
  contact: [find('Exchange admin center', 'Recipients > Contacts', `${EAC}/#/contacts`), find('Microsoft 365 admin center', 'Users > Contacts', `${M365}/#/contacts`)],
  publicFolder: [find('Exchange admin center', 'Public folders', `${EAC}/#/publicfolders`)],
  domain: [find('Microsoft Entra admin center', 'Domain names', `${ENTRA}/#view/Microsoft_AAD_IAM/DomainsManagementMenuBlade/~/CustomDomainNames`), find('Exchange admin center', 'Mail flow > Accepted domains', `${EAC}/#/accepteddomains`)],
  dkim: [find('Microsoft Defender portal', 'Email authentication settings > DKIM', `${DEFENDER}/authentication?viewid=DKIM`)],
  transportRule: [find('Exchange admin center', 'Mail flow > Rules', `${EAC}/#/transportrules`)],
  connector: [find('Exchange admin center', 'Mail flow > Connectors', `${EAC}/#/connectors`)],
  remoteDomain: [find('Exchange admin center', 'Mail flow > Remote domains', `${EAC}/#/remotedomains`)],
  antiSpam: [find('Microsoft Defender portal', 'Policies > Anti-spam', `${DEFENDER}/antispam`)],
  antiPhish: [find('Microsoft Defender portal', 'Policies > Anti-phishing', `${DEFENDER}/antiphishing`)],
  antiMalware: [find('Microsoft Defender portal', 'Policies > Anti-malware', `${DEFENDER}/antimalwarev2`)],
  safeLinks: [find('Microsoft Defender portal', 'Policies > Safe Links', `${DEFENDER}/safelinksv2`)],
  safeAttachments: [find('Microsoft Defender portal', 'Policies > Safe Attachments', `${DEFENDER}/safeattachmentv2`)],
  outbound: [find('Microsoft Defender portal', 'Policies > Anti-spam > Anti-spam outbound policy', `${DEFENDER}/antispam`)],
  connectionFilter: [find('Microsoft Defender portal', 'Policies > Anti-spam > Connection filter policy', `${DEFENDER}/antispam`)],
  presetPolicy: [find('Microsoft Defender portal', 'Policies > Preset security policies', `${DEFENDER}/presetSecurityPolicies`)],
  quarantinePolicy: [find('Microsoft Defender portal', 'Quarantine policies', `${DEFENDER}/quarantinePolicies`)],
  quarantineMessage: [find('Microsoft Defender portal', 'Quarantine', `${DEFENDER}/quarantine`)],
  message: [find('Exchange admin center', 'Mail flow > Message trace', `${EAC}/#/messagetrace`), find('Microsoft Defender portal', 'Message trace', `${DEFENDER}/messagetrace`)],
  roleGroup: [find('Exchange admin center', 'Roles > Admin roles', `${EAC}/#/adminroles`)],
  userRolePolicy: [find('Exchange admin center', 'Roles > User roles', `${EAC}/#/userroles`)],
  roleAssignment: [find('Exchange admin center', 'Roles > Admin roles (open the role group, Assigned roles)', `${EAC}/#/adminroles`)],
  migration: [find('Exchange admin center', 'Migration', `${EAC}/#/migration`)],
  inboxRule: [find('Outlook on the web', 'Settings > Mail > Rules (signed in as the mailbox owner)', 'https://outlook.office.com/mail/options/mail/rules')],
  dlp: [find('Microsoft Purview portal', 'Data loss prevention > Policies', `${PURVIEW}/datalossprevention/policies`)],
  label: [find('Microsoft Purview portal', 'Information protection > Sensitivity labels', `${PURVIEW}/informationprotection/informationprotectionlabels/sensitivitylabels`)],
  labelPolicy: [find('Microsoft Purview portal', 'Information protection > Publishing policies', `${PURVIEW}/informationprotection/labelpolicies`)],
  retention: [find('Microsoft Purview portal', 'Data lifecycle management > Retention policies', `${PURVIEW}/datalifecyclemanagement/retention`)],
  retentionLabel: [find('Microsoft Purview portal', 'Data lifecycle management > Retention labels', `${PURVIEW}/datalifecyclemanagement/retentionlabels`)],
  ediscovery: [find('Microsoft Purview portal', 'eDiscovery > Cases', `${PURVIEW}/ediscovery`)],
  purviewRole: [find('Microsoft Purview portal', 'Settings > Roles and scopes', `${PURVIEW}/permissions`)],
  entraRole: [find('Microsoft Entra admin center', 'Roles and administrators', `${ENTRA}/#view/Microsoft_AAD_IAM/RolesManagementMenuBlade/~/AllRoles`), find('Microsoft 365 admin center', 'Roles > Role assignments', `${M365}/#/rbac/directory`)],
  signIn: [find('Microsoft Entra admin center', 'Monitoring > Sign-in logs', `${ENTRA}/#view/Microsoft_AAD_IAM/SignInLogsList.ReactView`)],
  license: [find('Microsoft Entra admin center', 'Licenses > All products', `${ENTRA}/#view/Microsoft_AAD_IAM/LicensesMenuBlade/~/Products`)],
  healthService: [find('Microsoft 365 admin center', 'Health > Service health', `${M365}/#/servicehealth`)],
  journalRule: [find('Microsoft Purview portal', 'Data lifecycle management > Exchange (legacy) > Journal rules', `${PURVIEW}/datalifecyclemanagement/exchange/journalrules`)],
  tenantAllowBlock: [find('Microsoft Defender portal', 'Policies & rules > Threat policies > Tenant Allow/Block Lists', `${DEFENDER}/tenantAllowBlockList`)],
  advancedDelivery: [find('Microsoft Defender portal', 'Policies & rules > Threat policies > Advanced delivery', `${DEFENDER}/advanceddelivery`)],
  autoLabel: [find('Microsoft Purview portal', 'Information protection > Policies > Auto-labeling policies', `${PURVIEW}/informationprotection/autolabeling`)],
};
// Settings that no portal shows: only PowerShell changes them.
export const POWERSHELL_ONLY = {
  authPolicy: 'Set-AuthenticationPolicy',
  managementScope: 'Set-ManagementScope',
  appAccessPolicy: 'Set-ApplicationAccessPolicy',
  externalTag: 'Set-ExternalInOutlook',
  transportConfig: 'Set-TransportConfig',
  // The classic Exchange admin center (admin.exchange.microsoft.com/ecp/) returns 404 (checked in a signed-in browser
  // 2026-11-23), and the new one has no page for these, so PowerShell is the only place left.
  mrmPolicy: 'Set-RetentionPolicy',
  owaPolicy: 'Set-OwaMailboxPolicy',
};

function userLinks(id, upn) {
  return [
    direct('Microsoft 365 admin center', 'Microsoft 365 admin center: user details (licenses, mail, sign-in block)', `${M365}/#/users/:/UserDetails/${id}`),
    direct('Entra', 'Microsoft Entra admin center: user overview (properties, groups, roles, authentication methods)', `${ENTRA}/#view/Microsoft_AAD_UsersAndTenants/UserProfileMenuBlade/~/overview/userId/${id}`),
    direct('Azure portal', 'Azure portal: Microsoft Entra user overview', `${AZURE}/#view/Microsoft_AAD_UsersAndTenants/UserProfileMenuBlade/~/overview/userId/${id}`),
    direct('Intune', 'Microsoft Intune admin center: the user\'s devices and app protection', `${INTUNE}/#view/Microsoft_AAD_UsersAndTenants/UserProfileMenuBlade/~/overview/userId/${id}`),
    direct('Defender', 'Microsoft Defender portal: user page (alerts, activity)', `${DEFENDER}/user?aad=${id}${upn ? `&upn=${enc(upn)}` : ''}`),
  ];
}
// The Microsoft 365 admin center opens one group only under the tab it lives on, and the last path part
// says which kind it is (read live 2026-11-22). A wrong pair opens the right name with the wrong owners and
// settings, so an unknown kind falls back to the Active teams & groups list.
const M365_GROUP_TABS = { m365: ['UnifiedGroup', 0], security: ['CombinedSecurityGroup', 1], distribution: ['DistributionList', 2] };
export function groupFlavor(m365, type) {
  if (m365) return 'm365';
  const t = String(type || '');
  if (/^(m365|security|distribution)$/.test(t)) return t;
  if (/Unified|GroupMailbox/i.test(t)) return 'm365';
  if (/Security/i.test(t)) return 'security';
  if (/Distribution|RoomList/i.test(t)) return 'distribution';
  return '';
}
function groupLinks(id, m365, type) {
  const tab = M365_GROUP_TABS[groupFlavor(m365, type)];
  const out = [
    tab
      ? direct('Microsoft 365 admin center', 'Microsoft 365 admin center: group details (members, owners, settings)', `${M365}/#/groups/_/${tab[0]}/:/GroupDetails/${id}/${tab[1]}`)
      : find('Microsoft 365 admin center', 'Teams & groups > Active teams & groups', `${M365}/#/groups`),
    ...(tab ? [direct('Exchange admin center', 'Exchange admin center: group details (members, owners, delivery settings)', `${EAC}/#/groups/:/GroupDetails/${id}/${tab[1]}`)] : []),
    direct('Entra', 'Microsoft Entra admin center: group overview', `${ENTRA}/#view/Microsoft_AAD_IAM/GroupDetailsMenuBlade/~/Overview/groupId/${id}`),
    direct('Azure portal', 'Azure portal: Microsoft Entra group overview', `${AZURE}/#view/Microsoft_AAD_IAM/GroupDetailsMenuBlade/~/Overview/groupId/${id}`),
  ];
  if (m365) out.push(direct('Teams admin center', 'Teams admin center: the team for this group (only when the group has a team)', `${TEAMS}/teams/manage/${id}`));
  return out;
}

/**
 * kind: mailbox | resource | user | group | m365group | dynamicGroup | contact | publicFolder | address | domain |
 *       sku | servicePrincipal | caPolicy | entraRole | healthIssue | healthService | alert | incident | signIn,
 *       any key of FIND_PAGES, or any key of POWERSHELL_ONLY.
 * obj: { id, upn, name, skuId, appId, type } as the kind needs (type: a group's RecipientTypeDetails, or m365 | security | distribution).
 * Returns { links: [{ short, name|page, url, direct }], note } — links is never empty unless note says why.
 */
export function portalLinks(kind, obj = {}) {
  const id = String(obj.id || '').trim();
  const guid = isGuid(id);
  const findOf = key => (FIND_PAGES[key] || []).slice();
  switch (kind) {
    case 'mailbox': case 'user':
      return { links: [...(guid ? userLinks(id, obj.upn) : []), ...findOf('mailbox')], note: guid ? '' : 'Exchange did not return this mailbox\'s Entra object ID, so only the find-it pages are linked.' };
    case 'resource':
      return { links: [...(guid ? userLinks(id, obj.upn) : []), ...findOf('resource')], note: '' };
    case 'group': case 'm365group':
      return { links: [...(guid ? groupLinks(id, kind === 'm365group', obj.type) : []), ...findOf('group')], note: guid ? '' : 'Exchange did not return this group\'s Entra object ID, so only the find-it pages are linked.' };
    case 'contact':
      return { links: findOf('contact'), note: '' };
    case 'address': {
      // People Exchange names by address only (delegates, members): no object ID, so the find-it pages.
      return { links: [...findOf('mailbox'), find('Microsoft 365 admin center', 'Users > Active users', `${M365}/#/users`)], note: '' };
    }
    case 'domain': {
      const name = String(obj.name || '').trim().toLowerCase();
      if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(name)) return { links: findOf('domain'), note: '' };
      return { links: [direct('Microsoft 365 admin center', 'Microsoft 365 admin center: domain details (DNS records, services)', `${M365}/#/Domains/Details/${enc(name)}`), ...findOf('domain')], note: '' };
    }
    case 'sku': {
      const skuId = String(obj.skuId || '').trim();
      return { links: [...(isGuid(skuId) ? [direct('Microsoft 365 admin center', 'Microsoft 365 admin center: license details (assign and remove)', `${M365}/#/licensedetailpage?skuid=${skuId}`)] : []), ...findOf('license')], note: '' };
    }
    case 'servicePrincipal':
      if (!guid) return { links: [find('Microsoft Entra admin center', 'Enterprise applications', `${ENTRA}/#view/Microsoft_AAD_IAM/StartboardApplicationsMenuBlade/~/AppAppsPreview`)], note: '' };
      return { links: [
        direct('Entra', 'Microsoft Entra admin center: enterprise application', `${ENTRA}/#view/Microsoft_AAD_IAM/ManagedAppMenuBlade/~/Overview/objectId/${id}${isGuid(obj.appId) ? `/appId/${String(obj.appId).trim()}` : ''}`),
        direct('Azure portal', 'Azure portal: enterprise application', `${AZURE}/#view/Microsoft_AAD_IAM/ManagedAppMenuBlade/~/Overview/objectId/${id}${isGuid(obj.appId) ? `/appId/${String(obj.appId).trim()}` : ''}`),
      ], note: '' };
    case 'caPolicy':
      if (!guid) return { links: [find('Microsoft Entra admin center', 'Conditional Access > Policies', `${ENTRA}/#view/Microsoft_AAD_ConditionalAccess/ConditionalAccessBlade/~/Policies`)], note: '' };
      return { links: [
        direct('Entra', 'Microsoft Entra admin center: Conditional Access policy', `${ENTRA}/#view/Microsoft_AAD_ConditionalAccess/PolicyBlade/policyId/${id}`),
        direct('Azure portal', 'Azure portal: Conditional Access policy', `${AZURE}/#view/Microsoft_AAD_ConditionalAccess/PolicyBlade/policyId/${id}`),
      ], note: '' };
    case 'healthIssue':
      if (!/^[A-Za-z]{2,}\d+$/.test(id)) return { links: findOf('healthService'), note: '' };
      return { links: [direct('Microsoft 365 admin center', 'Microsoft 365 admin center: service health issue', `${M365}/#/servicehealth/:/alerts/${enc(id)}`)], note: '' };
    case 'alert':
      if (!/^[\w-]{6,}$/.test(id)) return { links: [find('Microsoft Defender portal', 'Incidents & alerts > Alerts', `${DEFENDER}/alerts`)], note: '' };
      return { links: [direct('Defender', 'Microsoft Defender portal: alert', `${DEFENDER}/alerts/${enc(id)}`)], note: '' };
    case 'incident':
      if (!/^\d+$/.test(id)) return { links: [find('Microsoft Defender portal', 'Incidents & alerts > Incidents', `${DEFENDER}/incidents`)], note: '' };
      return { links: [direct('Defender', 'Microsoft Defender portal: incident', `${DEFENDER}/incidents/${id}`)], note: '' };
    default:
      if (POWERSHELL_ONLY[kind]) return { links: [], note: `No portal shows this. Change it in Exchange Online PowerShell with ${POWERSHELL_ONLY[kind]}.` };
      if (FIND_PAGES[kind]) return { links: findOf(kind), note: '' };
      return { links: [], note: 'No portal page is known for this object.' };
  }
}

// The words shown for one link: a direct link names the portal; a find link says where to look and for what.
export function linkTitle(link, label) {
  if (link.direct) return `Open ${label ? `${label} ` : ''}in ${link.name}`;
  return `${link.short}: find ${label ? `"${label}" ` : 'it '}here, under ${link.page}`;
}

// Recipient rows from the Single recipient search: source user | group | contact | exo | demo.
export function recipientKind(row = {}) {
  const type = String(row.type || '');
  if (row.source === 'contact' || /Contact/.test(type)) return 'contact';
  if (/PublicFolder/.test(type)) return 'publicFolder';
  if (/Dynamic/.test(type)) return 'dynamicGroup';
  if (/GroupMailbox|Unified/.test(type)) return 'm365group';
  if (row.source === 'group' || /Group|RoomList/.test(type)) return 'group';
  if (/Room|Equipment/.test(type)) return 'resource';
  return 'mailbox';
}
