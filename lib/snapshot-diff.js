// Config snapshots: compare two mail flow configuration files (format sectechtalk.mailflow-config, version 1).
// A snapshot is the read-only export (export/Export-MailFlowConfig.ps1) saved with a small "snapshot" header.
// Pure functions, used by the server, the Snapshots page and the tests. Nothing here reads or changes a tenant.

export const SNAPSHOT_FORMAT = 'sectechtalk.mailflow-config';

// Properties that change on their own (counters, timestamps, PowerShell plumbing). They are left out of the
// comparison so a diff shows configuration changes, not noise. The page lists them.
export const IGNORED_PROPERTIES = [
  'WhenChanged', 'WhenChangedUTC', 'LastModifiedTime', 'LastModifiedTimeUtc', 'ModifiedTime',
  'RunspaceId', 'PSComputerName', 'PSShowComputerName', 'PSSourceJobInstanceId', 'OriginatingServer',
  'ItemCount', 'DeletedItemCount', 'AssociatedItemCount', 'TotalItemSize', 'TotalDeletedItemSize', 'MessageTableTotalSize',
  'AttachmentTableTotalSize', 'OtherTablesTotalSize', 'SystemMessageCount', 'SystemMessageSize',
  'LastLogonTime', 'LastLogoffTime', 'LastInteractionTime', 'LastUserActionTime', 'LastUserAccessTime',
];
const IGNORED = new Set(IGNORED_PROPERTIES.map(p => p.toLowerCase()));

// Keys tried in order to match the same object in both snapshots. The first key that every item in both lists has,
// with no repeats, wins. Otherwise objects are matched by position and the page says so.
const KEY_CANDIDATES = ['Guid', 'ExchangeObjectId', 'ImmutableId', 'Id', 'Identity', 'DistinguishedName', 'Name', 'DomainName', 'Value', 'User'];

export function isSnapshotFile(cfg) {
  return Boolean(cfg && typeof cfg === 'object' && cfg.format === SNAPSHOT_FORMAT && cfg.version === 1 && cfg.sections && typeof cfg.sections === 'object');
}

function text(v) {
  if (v == null) return '';
  return typeof v === 'object' ? JSON.stringify(v) : String(v);
}

function pickKey(before, after) {
  const all = [...before, ...after];
  if (!all.length) return '';
  for (const key of KEY_CANDIDATES) {
    const ok = [before, after].every(list => {
      const seen = new Set();
      for (const item of list) {
        if (!item || typeof item !== 'object') return false;
        const v = text(item[key]);
        if (!v || seen.has(v)) return false;
        seen.add(v);
      }
      return true;
    });
    if (ok) return key;
  }
  return '';
}

// A readable name for one object: what the portal would show first.
export function objectName(item, key = '') {
  if (!item || typeof item !== 'object') return text(item) || '(value)';
  for (const k of ['DisplayName', 'Name', 'DomainName', 'Identity', 'Value', 'User', 'PrimarySmtpAddress', key]) {
    if (k && item[k] != null && text(item[k])) return text(item[k]);
  }
  return '(no name)';
}

// Flattens one object into "path" -> text, so nested values (lists, dictionaries) compare property by property.
// Lists of plain values are compared as one sorted list, so order-only changes are not reported.
function flatten(value, prefix = '', out = {}) {
  if (Array.isArray(value)) {
    if (value.every(v => v == null || typeof v !== 'object')) {
      out[prefix] = value.map(text).sort().join('\n');
      return out;
    }
    value.forEach((v, i) => flatten(v, `${prefix}[${i}]`, out));
    if (!value.length) out[prefix] = '';
    return out;
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value);
    if (!keys.length && prefix) out[prefix] = '';
    for (const k of keys) {
      if (IGNORED.has(k.toLowerCase())) continue;
      flatten(value[k], prefix ? `${prefix}.${k}` : k, out);
    }
    return out;
  }
  out[prefix] = text(value);
  return out;
}

export function compareObjects(before, after) {
  const a = flatten(before);
  const b = flatten(after);
  const changes = [];
  for (const path of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
    const was = a[path] ?? '';
    const now = b[path] ?? '';
    if (was !== now) changes.push({ property: path, before: was, after: now });
  }
  return changes;
}

function itemsOf(section) {
  return Array.isArray(section?.items) ? section.items : [];
}

/**
 * Compares two snapshot files. Returns { ok, before, after, sections: [...], totals }.
 * Each section: { name, title, group, statusBefore, statusAfter, matchedBy, added, removed, changed, objects }.
 * objects: { change: 'Added'|'Removed'|'Changed', name, key, changes: [{ property, before, after }] }.
 */
export function diffSnapshots(before, after) {
  if (!isSnapshotFile(before) || !isSnapshotFile(after)) return { ok: false, message: 'Both files must be mail flow configuration snapshots (format sectechtalk.mailflow-config, version 1).' };
  const names = [...new Set([...Object.keys(before.sections), ...Object.keys(after.sections)])];
  const sections = [];
  const totals = { sections: 0, changedSections: 0, added: 0, removed: 0, changed: 0, notComparable: 0 };
  for (const name of names) {
    const s1 = before.sections[name];
    const s2 = after.sections[name];
    const row = {
      name,
      title: s2?.title || s1?.title || name,
      group: s2?.group || s1?.group || '',
      statusBefore: s1?.status || 'missing',
      statusAfter: s2?.status || 'missing',
      matchedBy: '',
      added: 0, removed: 0, changed: 0,
      comparable: true,
      objects: [],
    };
    totals.sections += 1;
    // A section that was not read on one side cannot be compared: "not read" is not the same as "nothing configured".
    const readable = st => st === 'ok' || st === 'empty';
    if (!readable(row.statusBefore) || !readable(row.statusAfter)) {
      row.comparable = false;
      totals.notComparable += 1;
      if (row.statusBefore !== row.statusAfter) totals.changedSections += 1;
      sections.push(row);
      continue;
    }
    const l1 = itemsOf(s1);
    const l2 = itemsOf(s2);
    const key = pickKey(l1, l2);
    row.matchedBy = key || 'position';
    const idOf = (item, i) => (key ? text(item[key]) : String(i));
    const m1 = new Map(l1.map((item, i) => [idOf(item, i), item]));
    const m2 = new Map(l2.map((item, i) => [idOf(item, i), item]));
    for (const [id, item] of m2) {
      if (!m1.has(id)) { row.objects.push({ change: 'Added', name: objectName(item, key), key: id, changes: compareObjects({}, item) }); row.added += 1; }
    }
    for (const [id, item] of m1) {
      if (!m2.has(id)) { row.objects.push({ change: 'Removed', name: objectName(item, key), key: id, changes: compareObjects(item, {}) }); row.removed += 1; continue; }
      const changes = compareObjects(item, m2.get(id));
      if (changes.length) { row.objects.push({ change: 'Changed', name: objectName(m2.get(id), key), key: id, changes }); row.changed += 1; }
    }
    totals.added += row.added;
    totals.removed += row.removed;
    totals.changed += row.changed;
    if (row.added || row.removed || row.changed) totals.changedSections += 1;
    sections.push(row);
  }
  return { ok: true, before: describe(before), after: describe(after), sections, totals };
}

// The header facts the list and the diff show for one file.
export function describe(cfg) {
  const s = cfg?.summary || {};
  return {
    takenAt: cfg?.snapshot?.takenAt || cfg?.generatedAt || '',
    takenBy: cfg?.snapshot?.takenBy || cfg?.tenant?.signedInAs || '',
    label: cfg?.snapshot?.label || '',
    organization: cfg?.tenant?.organization || cfg?.tenant?.defaultDomain || '',
    tenantId: cfg?.tenant?.tenantId || '',
    mailbox: cfg?.mailbox?.address || '',
    sections: s.sections ?? Object.keys(cfg?.sections || {}).length,
    ok: s.ok ?? 0,
    empty: s.empty ?? 0,
    notRead: (s.error || 0) + (s.unavailable || 0) + (s.skipped || 0),
    sample: Boolean(cfg?.sample),
  };
}

// Text shaped like a secret. A snapshot is refused (never written) if any of these appear anywhere in it.
// Same patterns as the export script's own check, so a file that passed there passes here.
export const SECRET_PATTERNS = [
  ['JSON Web Token', /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/],
  ['private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['SAS signature', /[?&]sig=[A-Za-z0-9%+/=]{20,}/],
];
export function secretsIn(textValue) {
  return SECRET_PATTERNS.filter(([, re]) => re.test(textValue)).map(([name]) => name);
}

// A safe file name for a snapshot: ex360-snapshot-<org>-<yyyyMMdd-HHmmss>.json
export function snapshotFileName(organization, when = new Date()) {
  const org = String(organization || 'tenant').toLowerCase().replace(/[^a-z0-9.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'tenant';
  const iso = new Date(when).toISOString();
  const stamp = `${iso.slice(0, 10).replace(/-/g, '')}-${iso.slice(11, 19).replace(/:/g, '')}`;
  return `ex360-snapshot-${org}-${stamp}.json`;
}

// Only plain .json names, no folders: the server reads and serves files from one folder by name.
export function safeSnapshotName(name) {
  const n = String(name || '');
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,150}\.json$/.test(n) && !n.includes('..') ? n : '';
}
