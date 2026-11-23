// Security & Compliance PowerShell rows turned into the shape the Compliance pages and Config review use.
// Live reads return PascalCase cmdlet properties; the pages read the lower-case shape the demo uses.
const arr = v => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]);
const isAll = list => arr(list).some(v => /^all$/i.test(String(v)));
const truthy = v => v === true || v === 'True' || v === 'true';

export function workloadList(value) {
  return arr(value).flatMap(v => String(v).split(/[,;]\s*/)).map(s => s.trim()).filter(Boolean);
}

// Sensitive info type names from the classic property or the new editor's AdvancedRule JSON.
export function sensitiveTypes(rule) {
  const out = new Set(arr(rule.SensitiveTypes).filter(Boolean).map(String));
  const advanced = String(rule.AdvancedRule || '');
  for (const block of advanced.matchAll(/"Sensitivetypes"\s*:\s*\[([\s\S]*?)\]/gi)) {
    for (const m of block[1].matchAll(/"Name"\s*:\s*"([^"]+)"/gi)) out.add(m[1]);
  }
  return [...out];
}

export function shapeDlpPolicy(p) {
  const users = arr(p.ExchangeLocation).filter(v => !/^all$/i.test(String(v)));
  return {
    name: p.Name, mode: p.Mode || '', enabled: p.Enabled === undefined ? true : truthy(p.Enabled) || p.Enabled === true,
    workloads: workloadList(p.Workload), scope: isAll(p.ExchangeLocation) && !arr(p.ExchangeSenderMemberOf).length ? 'all' : '',
    users, groups: arr(p.ExchangeSenderMemberOf), exclude: arr(p.ExchangeLocationException),
    priority: p.Priority ?? null, distribution: p.DistributionStatus || '', changed: p.WhenChanged || '',
  };
}

export function shapeDlpRule(r) {
  return {
    name: r.Name, policy: r.ParentPolicyName || r.Policy || '', mode: r.Mode || '', disabled: truthy(r.Disabled),
    blocks: truthy(r.BlockAccess), blockScope: r.BlockAccessScope || '', notifyUser: arr(r.NotifyUser),
    severity: r.ReportSeverityLevel || '', incidentReport: arr(r.GenerateIncidentReport), sensitiveTypes: sensitiveTypes(r),
    advanced: Boolean(r.AdvancedRule), priority: r.Priority ?? null, accessScope: r.AccessScope || '',
  };
}

export function durationText(rule) {
  if (!rule) return '';
  const days = Number(rule.RetentionDuration);
  if (!Number.isFinite(days) || !days) return String(rule.RetentionDuration || '') || 'Unlimited';
  if (days % 365 === 0) return `${days / 365} year${days === 365 ? '' : 's'}`;
  if (days >= 365) return `${Math.round(days / 36.5) / 10} years (${days} days)`;
  return `${days} days`;
}

export function shapeRetentionPolicy(p, rules = []) {
  const rule = arr(rules).find(r => r.Policy === p.Name || r.Policy === p.Guid);
  const exchange = arr(p.ExchangeLocation);
  return {
    name: p.Name, enabled: p.Enabled === undefined ? true : truthy(p.Enabled) || p.Enabled === true, mode: p.Mode || '',
    locations: exchange.length || /exchange/i.test(String(p.Workload || '')) ? ['Exchange', ...workloadList(p.Workload).filter(w => !/exchange/i.test(w))] : workloadList(p.Workload),
    workloads: workloadList(p.Workload), scope: isAll(exchange) ? 'all' : '', users: exchange.filter(v => !/^all$/i.test(String(v))),
    exclude: arr(p.ExchangeLocationException), duration: durationText(rule), action: rule?.RetentionComplianceAction || '',
    distribution: p.DistributionStatus || '', createdBy: p.CreatedBy || '', changed: p.WhenChanged || '',
  };
}

export function shapeCompliance(ipps) {
  const cmd = name => {
    if (!ipps || ipps.ok === false) return ipps;
    const row = (ipps.commands || []).find(c => c.name === name);
    if (!row) return { ok: true, value: [] };
    if (row.ok === false) return { ok: false, authorized: !/not authorized|access denied|forbidden/i.test(row.error || ''), label: /not authorized|access denied|forbidden/i.test(row.error || '') ? 'Not authorized' : 'Could not read', message: String(row.error || '').slice(0, 240) };
    return { ok: true, value: arr(row.value) };
  };
  const map = (r, fn) => (r && r.ok ? r.value.map(fn) : r);
  const rules = cmd('retentionRules');
  const dlpRules = cmd('dlpRules');
  const dlp = map(cmd('dlpPolicies'), shapeDlpPolicy);
  if (Array.isArray(dlp) && dlpRules?.ok) for (const p of dlp) p.rules = dlpRules.value.filter(r => r.ParentPolicyName === p.name).map(r => r.Name);
  return {
    dlp,
    dlpRules: map(dlpRules, shapeDlpRule),
    retentionPolicies: map(cmd('retentionPolicies'), p => shapeRetentionPolicy(p, rules?.ok ? rules.value : [])),
    labelsPs: map(cmd('labels'), l => ({ name: l.DisplayName || l.Name, priority: l.Priority ?? '', disabled: truthy(l.Disabled), contentType: l.ContentType || '', parent: l.ParentId || '', createdBy: l.CreatedBy || '', changed: l.WhenChanged || '' })),
    labelPolicies: map(cmd('labelPolicies'), p => ({ name: p.Name, labels: arr(p.Labels), publishedTo: isAll(p.ExchangeLocation) ? 'All' : arr(p.ExchangeLocation).join(', '), enabled: p.Enabled !== false, distribution: p.DistributionStatus || '', priority: p.Priority ?? '', createdBy: p.CreatedBy || '', changed: p.WhenChanged || '' })),
    casesPs: map(cmd('cases'), c => ({ name: c.Name, status: c.Status, type: c.CaseType, id: c.Identity })),
    holds: map(cmd('holds'), h => ({ name: h.Name, caseId: h.CaseId, enabled: h.Enabled !== false, mailboxes: arr(h.ExchangeLocation), distribution: h.DistributionStatus || '' })),
    purviewRoles: map(cmd('purviewRoles'), g => ({ name: g.DisplayName || g.Name, description: g.Description || '', roles: arr(g.Roles), members: arr(g.Members).map(m => ({ displayName: m })) })),
    auditEvents: map(cmd('audit'), e => ({ when: e.CreationDate, user: e.UserIds, operation: e.Operations, recordType: e.RecordType, data: e.AuditData || '' })),
  };
}
