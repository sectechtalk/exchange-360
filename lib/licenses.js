// Service-plan and SKU part numbers Microsoft publishes for Microsoft 365 and Exchange Online.
// A feature is "unlocked" when any subscribed SKU that still has enabled units includes one of the service plans.
export const SERVICE_PLANS = {
  EXCHANGE_S_STANDARD: { name: 'Exchange Online (Plan 1)', features: ['mailbox-50gb', 'connectors', 'transport-rules', 'eop', 'dkim'] },
  EXCHANGE_S_ENTERPRISE: { name: 'Exchange Online (Plan 2)', features: ['mailbox-100gb', 'archive', 'connectors', 'transport-rules', 'eop', 'dkim', 'litigation-hold'] },
  EXCHANGE_S_DESKLESS: { name: 'Exchange Online Kiosk', features: ['connectors', 'transport-rules', 'eop', 'dkim'] },
  EXCHANGE_S_ARCHIVE_ADDON: { name: 'Exchange Online Archiving', features: ['archive'] },
  ATP_ENTERPRISE: { name: 'Microsoft Defender for Office 365 (Plan 1)', features: ['safe-links', 'safe-attachments', 'anti-phish', 'mdo-p1'] },
  THREAT_INTELLIGENCE: { name: 'Microsoft Defender for Office 365 (Plan 2)', features: ['safe-links', 'safe-attachments', 'anti-phish', 'impersonation', 'air', 'attack-sim', 'mdo-p2'] },
  ATP_ENTERPRISE_FACULTY: { name: 'Microsoft Defender for Office 365 (Plan 1) for faculty', features: ['safe-links', 'safe-attachments', 'anti-phish', 'mdo-p1'] },
  PURVIEW_E3: { name: 'Purview capabilities in Microsoft 365 E3', features: ['dlp', 'retention', 'labels', 'ediscovery', 'audit'] },
  PURVIEW_E5: { name: 'Purview capabilities in Microsoft 365 E5', features: ['dlp', 'retention', 'labels', 'ediscovery', 'audit', 'ediscovery-premium', 'audit-advanced', 'autolabel'] },
};

export const SKUS = {
  SPE_E3: { name: 'Microsoft 365 E3', plans: ['EXCHANGE_S_ENTERPRISE', 'PURVIEW_E3'] },
  SPE_E5: { name: 'Microsoft 365 E5', plans: ['EXCHANGE_S_ENTERPRISE', 'THREAT_INTELLIGENCE', 'PURVIEW_E5'] },
  SPE_E3_NOPSTNCONF: { name: 'Microsoft 365 E3 (no Teams audio conferencing)', plans: ['EXCHANGE_S_ENTERPRISE', 'PURVIEW_E3'] },
  SPE_E5_NOPSTNCONF: { name: 'Microsoft 365 E5 (no Teams audio conferencing)', plans: ['EXCHANGE_S_ENTERPRISE', 'THREAT_INTELLIGENCE', 'PURVIEW_E5'] },
  SPE_F1: { name: 'Microsoft 365 F3', plans: ['EXCHANGE_S_DESKLESS'] },
  M365_F1: { name: 'Microsoft 365 F1', plans: [] },
  MICROSOFT_365_E7: { name: 'Microsoft 365 E7', plans: [] },
  ENTERPRISEPACK: { name: 'Office 365 E3', plans: ['EXCHANGE_S_ENTERPRISE'] },
  ENTERPRISEPREMIUM: { name: 'Office 365 E5', plans: ['EXCHANGE_S_ENTERPRISE', 'THREAT_INTELLIGENCE'] },
  ENTERPRISEPREMIUM_NOPSTNCONF: { name: 'Office 365 E5 (no Teams audio conferencing)', plans: ['EXCHANGE_S_ENTERPRISE', 'THREAT_INTELLIGENCE'] },
  STANDARDPACK: { name: 'Office 365 E1', plans: ['EXCHANGE_S_STANDARD'] },
  DESKLESSPACK: { name: 'Office 365 F3', plans: ['EXCHANGE_S_DESKLESS'] },
  EXCHANGESTANDARD: { name: 'Exchange Online (Plan 1)', plans: ['EXCHANGE_S_STANDARD'] },
  EXCHANGEENTERPRISE: { name: 'Exchange Online (Plan 2)', plans: ['EXCHANGE_S_ENTERPRISE'] },
  EXCHANGEDESKLESS: { name: 'Exchange Online Kiosk', plans: ['EXCHANGE_S_DESKLESS'] },
  EXCHANGEARCHIVE_ADDON: { name: 'Exchange Online Archiving for Exchange Online', plans: ['EXCHANGE_S_ARCHIVE_ADDON'] },
  EXCHANGE_S_ESSENTIALS: { name: 'Exchange Online Essentials', plans: ['EXCHANGE_S_STANDARD'] },
  ATP_ENTERPRISE: { name: 'Microsoft Defender for Office 365 Plan 1', plans: ['ATP_ENTERPRISE'] },
  THREAT_INTELLIGENCE: { name: 'Microsoft Defender for Office 365 Plan 2', plans: ['THREAT_INTELLIGENCE'] },
  SPB: { name: 'Microsoft 365 Business Premium', plans: ['EXCHANGE_S_ENTERPRISE', 'ATP_ENTERPRISE'] },
  O365_BUSINESS_PREMIUM: { name: 'Microsoft 365 Business Standard', plans: ['EXCHANGE_S_STANDARD'] },
  O365_BUSINESS_ESSENTIALS: { name: 'Microsoft 365 Business Basic', plans: ['EXCHANGE_S_STANDARD'] },
  O365_BUSINESS: { name: 'Microsoft 365 Apps for business', plans: [] },
  OFFICESUBSCRIPTION: { name: 'Microsoft 365 Apps for enterprise', plans: [] },
  EMS: { name: 'Enterprise Mobility + Security E3', plans: [] },
  EMSPREMIUM: { name: 'Enterprise Mobility + Security E5', plans: [] },
  AAD_PREMIUM: { name: 'Microsoft Entra ID P1', plans: [] },
  AAD_PREMIUM_P2: { name: 'Microsoft Entra ID P2', plans: [] },
  INFORMATION_PROTECTION_COMPLIANCE: { name: 'Microsoft 365 E5 Compliance', plans: ['PURVIEW_E5'] },
  IDENTITY_THREAT_PROTECTION: { name: 'Microsoft 365 E5 Security', plans: ['THREAT_INTELLIGENCE'] },
  Microsoft_365_Copilot: { name: 'Microsoft 365 Copilot', plans: [] },
  POWER_BI_STANDARD: { name: 'Power BI (free)', plans: [] },
  POWER_BI_PRO: { name: 'Power BI Pro', plans: [] },
  FLOW_FREE: { name: 'Microsoft Power Automate Free', plans: [] },
  POWERAPPS_DEV: { name: 'Microsoft Power Apps for Developer', plans: [] },
  TEAMS_EXPLORATORY: { name: 'Microsoft Teams Exploratory', plans: [] },
  'Teams_Premium_(for_Departments)': { name: 'Microsoft Teams Premium', plans: [] },
  DEVELOPERPACK_E5: { name: 'Microsoft 365 E5 Developer (without Windows and Audio Conferencing)', plans: ['EXCHANGE_S_ENTERPRISE', 'THREAT_INTELLIGENCE'] },
  WINDOWS_STORE: { name: 'Windows Store for Business', plans: [] },
  RIGHTSMANAGEMENT_ADHOC: { name: 'Rights Management Adhoc', plans: [] },
  STREAM: { name: 'Microsoft Stream', plans: [] },
  RMSBASIC: { name: 'Rights Management Service Basic Content Protection', plans: [] },
  DEFENDER_ENDPOINT_P1: { name: 'Microsoft Defender for Endpoint P1', plans: [] },
  MDATP_XPLAT: { name: 'Microsoft Defender for Endpoint P2', plans: [] },
  VISIOCLIENT: { name: 'Visio Plan 2', plans: [] },
  PROJECTPREMIUM: { name: 'Project Plan 5', plans: [] },
  CCIBOTS_PRIVPREV_VIRAL: { name: 'Copilot Studio Viral Trial', plans: [] },
};

// Words that keep a fixed spelling when a part number Microsoft has not been mapped above is turned into a name.
const WORDS = {
  MICROSOFT: 'Microsoft', OFFICE: 'Office', EXCHANGE: 'Exchange', ONLINE: 'Online', DEFENDER: 'Defender', ENTRA: 'Entra',
  TEAMS: 'Teams', COPILOT: 'Copilot', POWER: 'Power', BI: 'BI', PLAN: 'Plan', PREMIUM: 'Premium', STANDARD: 'Standard',
  BASIC: 'Basic', BUSINESS: 'Business', ENTERPRISE: 'Enterprise', FOR: 'for', AND: 'and', WITH: 'with', NO: 'no',
  APPS: 'Apps', PURVIEW: 'Purview', SECURITY: 'Security', COMPLIANCE: 'Compliance', TRIAL: 'Trial', FREE: 'Free',
  DEVELOPER: 'Developer', VIRAL: 'Viral', STUDIO: 'Studio', AUTOMATE: 'Automate', PHONE: 'Phone', SYSTEM: 'System',
  AUDIO: 'Audio', CONFERENCING: 'Conferencing', DOMESTIC: 'Domestic', CALLING: 'Calling', ROOMS: 'Rooms', PRO: 'Pro',
  INTUNE: 'Intune', WINDOWS: 'Windows', VISIO: 'Visio', PROJECT: 'Project', DYNAMICS: 'Dynamics', ID: 'ID',
};

// A readable name for any part number: the mapped Microsoft product name when we have it, otherwise the part
// number with underscores turned into spaces and known words spelled normally (MICROSOFT_365_E7 -> Microsoft 365 E7).
export function skuDisplayName(part) {
  const raw = String(part || '');
  if (!raw) return 'Unknown subscription';
  if (SKUS[raw]) return SKUS[raw].name;
  return raw.split(/[_\s]+/).filter(Boolean).map(word => {
    const upper = word.toUpperCase();
    if (WORDS[upper]) return WORDS[upper];
    if (/^[A-Z]?\d+[A-Z]?$/i.test(word) || /^P\d$/i.test(word) || /^[EFGAM]\d$/i.test(word)) return upper;
    return word.length <= 3 ? upper : upper[0] + upper.slice(1).toLowerCase();
  }).join(' ');
}

export const FEATURES = {
  'mailbox-50gb': { name: 'Exchange Online mailbox (50 GB)', needs: 'Exchange Online Plan 1' },
  'mailbox-100gb': { name: 'Exchange Online mailbox (100 GB)', needs: 'Exchange Online Plan 2' },
  archive: { name: 'Archive mailbox', needs: 'Exchange Online Plan 2 or Exchange Online Archiving' },
  'litigation-hold': { name: 'Litigation hold', needs: 'Exchange Online Plan 2' },
  connectors: { name: 'Connectors', needs: 'Exchange Online' },
  'transport-rules': { name: 'Mail flow rules', needs: 'Exchange Online' },
  eop: { name: 'Exchange Online Protection (anti-spam, anti-malware)', needs: 'Exchange Online' },
  dkim: { name: 'DKIM signing for accepted domains', needs: 'Exchange Online' },
  'safe-links': { name: 'Safe Links', needs: 'Microsoft Defender for Office 365 Plan 1' },
  'safe-attachments': { name: 'Safe Attachments', needs: 'Microsoft Defender for Office 365 Plan 1' },
  'anti-phish': { name: 'Anti-phishing policies beyond EOP', needs: 'Microsoft Defender for Office 365 Plan 1' },
  impersonation: { name: 'Impersonation protection and mailbox intelligence', needs: 'Microsoft Defender for Office 365 Plan 2' },
  air: { name: 'Automated investigation and response', needs: 'Microsoft Defender for Office 365 Plan 2' },
  'attack-sim': { name: 'Attack simulation training', needs: 'Microsoft Defender for Office 365 Plan 2' },
  'mdo-p1': { name: 'Defender for Office 365 Plan 1', needs: 'Defender for Office 365 Plan 1, Microsoft 365 E5, or Microsoft 365 Business Premium' },
  'mdo-p2': { name: 'Defender for Office 365 Plan 2', needs: 'Defender for Office 365 Plan 2 or Microsoft 365 E5' },
  dlp: { name: 'Exchange data loss prevention', needs: 'Microsoft 365 E3 or E5 (Purview DLP for Exchange)' },
  retention: { name: 'Purview retention for Exchange', needs: 'Microsoft 365 E3 or E5' },
  labels: { name: 'Sensitivity labels', needs: 'Microsoft 365 E3 or E5. Automatic labeling needs E5.' },
  ediscovery: { name: 'Core eDiscovery', needs: 'Microsoft 365 E3 or E5' },
  'ediscovery-premium': { name: 'eDiscovery (Premium)', needs: 'Microsoft 365 E5' },
  audit: { name: 'Unified audit log', needs: 'Microsoft 365 E3 or E5' },
  'audit-advanced': { name: 'Advanced Audit', needs: 'Microsoft 365 E5' },
  autolabel: { name: 'Automatic sensitivity labeling', needs: 'Microsoft 365 E5' },
};

export function normalizeSku(sku) {
  const part = sku.skuPartNumber || sku.partNumber || '';
  const known = SKUS[part];
  const consumed = sku.consumedUnits ?? 0;
  const enabled = sku.prepaidUnits?.enabled ?? sku.enabled ?? 0;
  const plans = (sku.servicePlans || []).map(p => ({
    name: p.servicePlanName || p.name,
    status: p.provisioningStatus || p.status || 'Success',
  }));
  // Graph capabilityStatus: Enabled, Warning (expired, in grace), Suspended, Deleted or LockedOut.
  // Only Enabled and Warning still give users the service.
  const status = sku.capabilityStatus || sku.status || 'Enabled';
  return {
    id: sku.id || '',
    skuId: sku.skuId || '',
    part,
    name: known?.name || sku.skuName || skuDisplayName(part),
    status,
    active: status === 'Enabled' || status === 'Warning',
    consumed,
    enabled,
    remaining: Math.max(0, enabled - consumed),
    plans,
    known: Boolean(known),
  };
}

export function unlockedFeatures(skus) {
  const have = new Set();
  for (const raw of skus || []) {
    const sku = raw.part ? raw : normalizeSku(raw);
    if (sku.active === false) continue;
    if ((sku.enabled ?? 1) <= 0 && (sku.consumed ?? 0) <= 0) continue;
    const fromPart = SKUS[sku.part]?.plans || [];
    const fromPlans = (sku.plans || []).filter(p => p.status === 'Success').map(p => p.name);
    for (const plan of [...fromPart, ...fromPlans]) {
      for (const feature of SERVICE_PLANS[plan]?.features || []) have.add(feature);
    }
  }
  return [...have];
}

export function featureStatus(skus) {
  const have = new Set(unlockedFeatures(skus));
  return Object.entries(FEATURES).map(([id, feature]) => ({
    id,
    name: feature.name,
    unlocked: have.has(id),
    needs: feature.needs,
  }));
}

export function licenseGap(skus, featureId) {
  const row = featureStatus(skus).find(f => f.id === featureId);
  if (!row) return null;
  if (row.unlocked) return null;
  return `This needs ${row.needs}. None of the subscribed SKUs include it.`;
}
