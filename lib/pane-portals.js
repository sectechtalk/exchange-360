// Every pane on every page links to the portal page that shows or changes the same thing.
// PANE_PORTALS[view] is the page's default portal; BY_TITLE[view][pane heading] overrides it for one pane.
// Pure, so the browser and the tests share one answer.
export const PANE_PORTALS = {
  setup: 'app-consent', start: 'eac-home', needs: 'licenses', asked: 'eac-home', glossary: 'eac-home', learn: 'eac-home', playbooks: 'eac-home',
  review: 'eac-home', licenses: 'licenses', domains: 'accepted-domains', connectors: 'connectors', rules: 'transport-rules',
  security: 'preset-policies', 'sec-antispam': 'anti-spam', 'sec-antiphish': 'anti-phish', 'sec-antimalware': 'anti-malware', 'sec-safelinks': 'safe-links', 'sec-safeattach': 'safe-attachments', 'sec-outbound': 'outbound-spam', 'sec-connection': 'anti-spam', 'sec-quarantine': 'quarantine-policies',
  config: 'auth-policies', health: 'service-health', migrations: 'migrations', 'admin-roles': 'admin-roles',
  'user-roles': 'user-roles', 'role-assignments': 'role-assignments', 'app-rbac': 'app-rbac', onprem: 'eac-home',
  dlp: 'dlp', labels: 'labels', 'retention-cc': 'retention-purview', ediscovery: 'ediscovery', 'compliance-admin': 'compliance-admin',
  audit: 'audit', changes: 'changes',
  'rcp-shared': 'mailboxes', 'rcp-resources': 'resources', 'rcp-forwarding': 'forwarding', 'rcp-groups': 'groups', 'rcp-dynamic': 'groups', 'rcp-m365': 'groups-m365',
  'mb-recipient': 'mailboxes', 'mb-forward': 'forwarding', 'mb-rules': 'forwarding', 'mb-delegation': 'delegation', 'mb-groups': 'groups',
  'mb-policies': 'preset-policies', 'mb-protocols': 'owa-mobile', 'mb-signins': 'signins', 'mb-findings': 'user-account',
  'mb-compliance': 'dlp', 'mb-ca': 'conditional-access', 'mb-xdr': 'xdr',
  trace: 'message-trace', nexthop: 'transport-rules', quarantine: 'quarantine-messages', hops: 'header-analyzer', outlook: 'support',
};

export const BY_TITLE = {
  needs: {},
  domains: { Domains: 'domains', 'DKIM signing in Exchange Online': 'dkim', 'Remote domains': 'remote-domains', 'Check any domain live': 'spf-dmarc' },
  security: { 'Anti-spam': 'anti-spam', 'Anti-phish': 'anti-phish', 'Anti-malware': 'anti-malware', 'Safe Links': 'safe-links', 'Safe Attachments': 'safe-attachments', 'Outbound spam': 'outbound-spam', 'Connection filter and tenant allow list': 'anti-spam', 'Quarantine policies': 'quarantine-policies' },
  config: { Organization: 'eac-home', 'Exchange retention (MRM)': 'retention', 'Mailbox policies': 'owa-mobile' },
  health: { 'Other status pages that affect mail flow': 'service-health' },
  'mb-policies': { 'Security policies': 'preset-policies', Quarantine: 'quarantine', 'Transport rules, in priority order': 'transport-rules', Connectors: 'connectors', Holds: 'retention' },
  'mb-protocols': { 'Authentication policy': 'auth-policies' },
  'mb-delegation': {},
  'admin-roles': { 'Microsoft Entra roles that reach Exchange Online': 'admin-roles', 'Purview and Defender role groups for email': 'compliance-admin' },
  'app-rbac': {},
  dlp: {},
  nexthop: { Configuration: 'eac-home', 'Topology at a glance': 'eac-home', 'Test message': 'message-trace', Examples: 'transport-rules', Prediction: 'transport-rules' },
};

// Recipient: the admin center list depends on what the recipient is.
export function recipientPortal(kind) {
  return kind === 'mailbox' ? 'mailboxes' : kind === 'm365group' ? 'groups-m365' : kind === 'group' ? 'groups' : 'contacts';
}

// Headings are matched on their start, so "Exchange retention (MRM) and ..." matches "Exchange retention (MRM)".
export function panePortal(view, title, kind) {
  const overrides = BY_TITLE[view] || {};
  const key = Object.keys(overrides).find(k => String(title || '').startsWith(k));
  if (key) return overrides[key];
  if (view === 'mb-recipient') {
    if (/^(Pick a recipient|General|Email addresses)/.test(title || '')) return recipientPortal(kind);
    if (/^(Owners|Members|Settings|Delivery management)/.test(title || '')) return kind === 'm365group' ? 'groups-m365' : kind === 'publicfolder' ? 'contacts' : 'groups';
  }
  return PANE_PORTALS[view] || 'eac-home';
}
