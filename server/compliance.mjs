import { graphList } from './graph.mjs';
import { runExo } from './exo.mjs';
import { notAuthorized } from '../lib/permissions.js';
import { DEMO_COMPLIANCE } from '../lib/demo-compliance.js';
import { featureStatus } from '../lib/licenses.js';
import { DEMO_ORG } from '../lib/demo.js';
import { shapeCompliance } from '../lib/compliance-shape.js';

function denied(call) {
  return notAuthorized(call);
}

async function graphSection(token, path, call) {
  if (!token) return denied(call);
  return graphList(token, path, call);
}

export async function loadCompliance({ demo, graphToken, exoToken, ippsToken, organization, user, operation, userPrincipalName = '', clientId = '' }) {
  if (demo) {
    return {
      ...DEMO_COMPLIANCE,
      licenses: featureStatus(DEMO_ORG.skus),
    };
  }
  const [ca, labels, retentionLabels, cases, incidents, alerts, entra, directoryAudit, migrations, roles, changes] = await Promise.all([
    graphSection(graphToken, '/identity/conditionalAccess/policies', 'policy'),
    graphSection(graphToken, '/security/informationProtection/sensitivityLabels', 'labels'),
    graphSection(graphToken, '/security/labels/retentionLabels', 'records'),
    graphSection(graphToken, '/security/cases/ediscoveryCases', 'ediscovery'),
    graphSection(graphToken, '/security/incidents?$top=25', 'incidents'),
    graphSection(graphToken, '/security/alerts_v2?$top=25', 'alerts'),
    graphSection(graphToken, '/directoryRoles?$expand=members', 'roles'),
    graphSection(graphToken, '/auditLogs/directoryAudits?$top=25', 'directoryAudit'),
    exoToken ? runExo({ token: exoToken, organization, mode: 'migrations', userPrincipalName, clientId }) : denied('exchange'),
    exoToken ? runExo({ token: exoToken, organization, mode: 'exoroles', userPrincipalName, clientId }) : denied('exchange'),
    exoToken ? runExo({ token: exoToken, organization, mode: 'adminaudit', userPrincipalName, clientId }) : denied('exchange'),
  ]);
  const ipps = ippsToken
    ? await runExo({ token: ippsToken, organization, mode: 'ipps', args: { user, operation }, userPrincipalName, clientId })
    : denied('ipps');
  const pick = (bundle, name) => {
    if (!bundle || bundle.ok === false) return bundle;
    return (bundle.commands || []).find(c => c.name === name) || { ok: true, value: [] };
  };
  const shaped = shapeCompliance(ipps);
  const casesFromGraph = cases.ok ? cases.value.map(c => ({ name: c.displayName, status: c.status, created: c.createdDateTime || '', changed: c.lastModifiedDateTime || '', modifiedBy: c.lastModifiedBy?.user?.displayName || '', number: c.externalId || '', description: c.description || '', holds: [] })) : null;
  if (casesFromGraph && Array.isArray(shaped.holds)) {
    for (const h of shaped.holds) {
      const owner = Array.isArray(shaped.casesPs) ? shaped.casesPs.find(c => c.id === h.caseId || c.name === h.caseId) : null;
      const target = casesFromGraph.find(c => owner && c.name === owner.name);
      if (target) target.holds.push(h);
    }
  }
  if (!casesFromGraph && Array.isArray(shaped.casesPs) && Array.isArray(shaped.holds)) {
    for (const c of shaped.casesPs) c.holds = shaped.holds.filter(h => h.caseId === c.id || h.caseId === c.name);
  }
  return {
    source: 'live',
    dlp: shaped.dlp,
    dlpRules: shaped.dlpRules,
    labels: Array.isArray(shaped.labelsPs) && shaped.labelsPs.length ? shaped.labelsPs : labels.ok ? labels.value.map(l => ({ name: l.name || l.displayName, priority: l.priority ?? l.sensitivity ?? '' })) : (Array.isArray(shaped.labelsPs) ? shaped.labelsPs : labels),
    labelPolicies: shaped.labelPolicies,
    retentionPolicies: shaped.retentionPolicies,
    retentionLabels: retentionLabels.ok ? retentionLabels.value.map(l => ({ name: l.displayName, retention: l.retentionDuration?.days != null ? `${l.retentionDuration.days} days` : (l.retentionDuration ? 'Unlimited' : ''), action: l.actionAfterRetentionPeriod || l.behaviorDuringRetentionPeriod || '', createdBy: l.createdBy?.user?.displayName || '', changed: l.lastModifiedDateTime || '' })) : retentionLabels,
    cases: casesFromGraph || (Array.isArray(shaped.casesPs) ? shaped.casesPs : cases),
    holds: shaped.holds,
    audit: pick(changes, 'config'),
    auditEvents: shaped.auditEvents,
    purviewRoles: shaped.purviewRoles,
    entraRoles: entra.ok ? { ok: true, value: entra.value } : entra,
    exchangeRoles: pick(roles, 'groups'),
    roleAssignments: pick(roles, 'assignments'),
    userRoles: pick(roles, 'userRoles'),
    managementScopes: pick(roles, 'scopes'),
    servicePrincipals: pick(roles, 'servicePrincipals'),
    appAccessPolicies: pick(roles, 'appAccessPolicies'),
    migrations: {
      endpoints: pick(migrations, 'endpoints'),
      batches: pick(migrations, 'batches'),
      moves: pick(migrations, 'moves'),
    },
    changes: pick(changes, 'changes'),
    directoryAudit: directoryAudit.ok ? { ok: true, value: directoryAudit.value } : directoryAudit,
    ca: ca.ok ? { ok: true, value: ca.value.map(p => ({
      name: p.displayName,
      state: p.state,
      applications: p.conditions?.applications?.includeApplications || [],
      includeUsers: p.conditions?.users?.includeUsers || [],
      excludeUsers: p.conditions?.users?.excludeUsers || [],
      includeGroups: p.conditions?.users?.includeGroups || [],
      clientAppTypes: p.conditions?.clientAppTypes || [],
      grant: (p.grantControls?.builtInControls || []).join(', '),
    })) } : ca,
    incidents: incidents.ok ? { ok: true, value: incidents.value } : incidents,
    alerts: alerts.ok ? { ok: true, value: alerts.value } : alerts,
    licenses: [],
  };
}
