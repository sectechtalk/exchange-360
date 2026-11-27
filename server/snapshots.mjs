// Config snapshots: one click reads the mail flow configuration (the same read-only Get- reads as
// export/Export-MailFlowConfig.ps1 and the NextHop live read) and stores it.
//
// Where it is stored:
//   - A snapshot store you run, when SNAPSHOT_STORE_URL and SNAPSHOT_STORE_API_SCOPE are set in .env. Exchange 360 sends the
//     snapshot to it with your own Entra token; the store checks your role and keeps it. Nothing is kept on the PC.
//   - Until then, the snapshots folder on the PC (%USERPROFILE%\Ex360-snapshots, mounted at /snapshots).
// Nothing is written to the tenant. A snapshot that contains text shaped like a secret is refused and never stored.
// Export files in the exports folder (/exports, read-only) are listed too, so an export can be compared with a snapshot.
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { runExport } from './nexthop-live.mjs';
import { clip } from '../lib/logsafe.js';
import { isSnapshotFile, describe, secretsIn, snapshotFileName, safeSnapshotName } from '../lib/snapshot-diff.js';

const SECTION_LINE = /^\s+(OK|EMPTY|ERROR|UNAVAILABLE|SKIPPED)\s+(\S+)/;
const jobs = new Map();

export function snapshotDir() {
  return process.env.EX360_SNAPSHOTS_DIR || path.join(homedir(), 'Ex360-snapshots');
}
function exportsDir() {
  return process.env.EX360_EXPORTS_DIR || '';
}
// Where the folder is on the PC, for the page: the container only knows /snapshots.
export function snapshotHostDir() {
  return process.env.EX360_SNAPSHOTS_HOST_LABEL || '%USERPROFILE%\\Ex360-snapshots';
}

// Snapshot store settings. Both values come from .env; the scope is api://<store API app id>/Snapshots.ReadWrite.
// http is allowed only for a store on the same PC: localhost, or host.docker.internal from inside the Exchange 360 container.
export function snapshotStoreSettings(env = process.env) {
  const url = String(env.SNAPSHOT_STORE_URL || '').trim().replace(/\/+$/, '');
  const scope = String(env.SNAPSHOT_STORE_API_SCOPE || '').trim();
  const valid = /^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(url) || /^http:\/\/(localhost|127\.0\.0\.1|host\.docker\.internal)(:\d+)?$/i.test(url);
  const scopeOk = /^api:\/\/[0-9a-f-]{36}\/Snapshots\.ReadWrite$/i.test(scope);
  return { configured: Boolean(valid && scopeOk), url: valid ? url : '', scope: scopeOk ? scope : '', problem: (url || scope) && !(valid && scopeOk) ? 'SNAPSHOT_STORE_URL or SNAPSHOT_STORE_API_SCOPE in .env is not valid, so snapshots are saved on this PC.' : '' };
}

function folders() {
  const out = [{ dir: snapshotDir(), source: 'snapshot' }];
  const ex = exportsDir();
  if (ex && path.resolve(ex) !== path.resolve(snapshotDir())) out.push({ dir: ex, source: 'export' });
  return out;
}

function listFolders(only) {
  const value = [];
  let skipped = 0;
  const problems = [];
  for (const { dir, source } of folders().filter(f => !only || only.includes(f.source))) {
    let names = [];
    try { names = readdirSync(dir); } catch (error) {
      if (error.code !== 'ENOENT') problems.push(`${source === 'snapshot' ? 'Snapshots' : 'Exports'} folder could not be read: ${error.code || error.message}`);
      continue;
    }
    for (const name of names) {
      if (!safeSnapshotName(name)) continue;
      try {
        const full = path.join(dir, name);
        const st = statSync(full);
        if (!st.isFile() || st.size > 200 * 1024 * 1024) { skipped += 1; continue; }
        const cfg = JSON.parse(readFileSync(full, 'utf8'));
        if (!isSnapshotFile(cfg)) { skipped += 1; continue; }
        value.push({ id: `${source}:${name}`, name, source, bytes: st.size, ...describe(cfg) });
      } catch { skipped += 1; }
    }
  }
  return { value, skipped, problems };
}

/** The snapshot store client. token() returns the person's access token for the store's API, or throws. fetcher is injectable for tests. */
export function snapshotStoreClient({ settings, token, fetcher = fetch }) {
  const call = async (method, p, body) => {
    let res;
    try {
      res = await fetcher(`${settings.url}${p}`, {
        method,
        headers: { authorization: `Bearer ${await token()}`, accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
        body,
        signal: AbortSignal.timeout(120000),
      });
    } catch (error) {
      throw new Error(error?.status === 401 || error?.code ? clip(error.message, 400) : `The snapshot store could not be reached at ${settings.url}: ${clip(error?.message || String(error), 300)}`);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(clip(data.message || data.error || `The snapshot store answered HTTP ${res.status}.`, 600)), { status: res.status });
    return data;
  };
  return {
    list: async () => (await call('GET', '/api/ex360/snapshots')).value || [],
    get: async name => call('GET', `/api/ex360/snapshots/${encodeURIComponent(name)}`),
    save: async text => call('POST', '/api/ex360/snapshots', text),
  };
}

/** Lists every snapshot (snapshot store or the PC folder) and every export file, newest first. */
export async function listSnapshots({ snapshotStore = null } = {}) {
  const local = listFolders(snapshotStore ? ['export'] : null);
  const value = [...local.value];
  const problems = [...local.problems];
  if (snapshotStore) {
    try {
      for (const s of await snapshotStore.list()) if (safeSnapshotName(s.name)) value.push({ ...s, id: `snapshotStore:${s.name}`, source: 'snapshotStore' });
    } catch (error) { problems.push(`The snapshots in the snapshot store could not be read: ${error.message}`); }
  }
  value.sort((a, b) => String(b.takenAt).localeCompare(String(a.takenAt)));
  return { ok: true, value, skipped: local.skipped, problems, store: snapshotStore ? 'snapshotStore' : 'pc', folder: snapshotHostDir() };
}

/** Reads one file by its list id ("snapshotStore:<name>", "snapshot:<name>" or "export:<name>"). Never reads outside the folders. */
export async function readSnapshot(id, { snapshotStore = null } = {}) {
  const [source, ...rest] = String(id || '').split(':');
  const name = safeSnapshotName(rest.join(':'));
  if (!name) return { ok: false, message: 'That snapshot name is not valid.' };
  if (source === 'snapshotStore') {
    if (!snapshotStore) return { ok: false, message: 'The snapshot store is not set up in this Exchange 360 (.env SNAPSHOT_STORE_URL and SNAPSHOT_STORE_API_SCOPE).' };
    try {
      const cfg = await snapshotStore.get(name);
      return isSnapshotFile(cfg) ? { ok: true, name, cfg } : { ok: false, message: `${name} from the snapshot store is not a mail flow configuration snapshot.` };
    } catch (error) { return { ok: false, message: error.message }; }
  }
  const folder = folders().find(f => f.source === source);
  if (!folder) return { ok: false, message: 'That snapshot name is not valid.' };
  try {
    const cfg = JSON.parse(readFileSync(path.join(folder.dir, name), 'utf8'));
    if (!isSnapshotFile(cfg)) return { ok: false, message: `${name} is not a mail flow configuration snapshot.` };
    return { ok: true, name, cfg };
  } catch (error) {
    return { ok: false, message: error.code === 'ENOENT' ? `${name} is no longer in the folder.` : `${name} could not be read: ${clip(error.message, 200)}` };
  }
}

/** Adds the snapshot header and checks for secrets. Returns { ok, name, text } or { ok: false, message }. */
export function buildSnapshot(cfg, { takenBy = '', label = '', now = new Date() } = {}) {
  if (!isSnapshotFile(cfg)) return { ok: false, message: 'The read did not return a mail flow configuration.' };
  const takenAt = new Date(now).toISOString();
  const name = snapshotFileName(cfg.tenant?.organization || cfg.tenant?.defaultDomain, takenAt);
  const out = { ...cfg, readOnly: true, snapshot: { name, takenAt, takenBy, label: String(label || '').slice(0, 120), app: 'Exchange 360', readOnly: true } };
  const text = JSON.stringify(out, null, 2);
  const found = secretsIn(text);
  if (found.length) return { ok: false, message: `The snapshot was not saved: it contains text shaped like a ${found.join(', ')}. Nothing was stored.` };
  return { ok: true, name, takenAt, text };
}

/** PC storage: writes the snapshot to the snapshots folder. */
export function saveSnapshot(cfg, opts = {}) {
  const built = buildSnapshot(cfg, opts);
  if (!built.ok) return built;
  const dir = snapshotDir();
  try {
    mkdirSync(dir, { recursive: true });
    const tmp = path.join(dir, `.${built.name}.tmp`);
    writeFileSync(tmp, built.text, { mode: 0o600 });
    renameSync(tmp, path.join(dir, built.name));
    return { ok: true, name: built.name, id: `snapshot:${built.name}`, takenAt: built.takenAt, where: snapshotHostDir() };
  } catch (error) {
    return { ok: false, message: `The snapshot could not be written to ${snapshotHostDir()}: ${error.code || clip(error.message, 200)}` };
  }
}

/** Snapshot store: sends the snapshot to the store, which keeps it. */
export function snapshotStoreSaver(snapshotStore) {
  return async (cfg, opts = {}) => {
    const built = buildSnapshot(cfg, opts);
    if (!built.ok) return built;
    try {
      const saved = await snapshotStore.save(built.text);
      return { ok: true, name: built.name, id: `snapshotStore:${built.name}`, takenAt: built.takenAt, where: `Snapshot store (${saved.repo || 'snapshots repository'}, commit ${String(saved.commit || '').slice(0, 7)})` };
    } catch (error) {
      return { ok: false, message: `The snapshot store did not store the snapshot: ${error.message}` };
    }
  };
}

export function snapshotStatus(sid) {
  const job = jobs.get(sid);
  if (!job) return { state: 'none' };
  const { state, startedAt, finishedAt, sections, total, step, message, name, id } = job;
  return { state, startedAt, finishedAt, sections, total, step, message, name, id };
}
export function forgetSnapshot(sid) { jobs.delete(sid); }

/**
 * Starts a snapshot for this session unless one is running. run is injectable for tests and has the same contract
 * as runExport: run({ exoToken, ippsToken, upn, mailbox, onLine }) resolves { code, config }. save may be async.
 */
export function startSnapshot(sid, { exoToken, ippsToken, upn, label = '', total = 0, run = runExport, save = saveSnapshot, now = () => new Date().toISOString() }) {
  const current = jobs.get(sid);
  if (current?.state === 'running') return snapshotStatus(sid);
  if (!exoToken || !upn) return { state: 'error', message: 'Sign in to Exchange Online first: a snapshot reads the tenant with your own Exchange sign-in.' };
  const job = { state: 'running', startedAt: now(), finishedAt: '', sections: 0, total, step: 'Starting PowerShell', message: '', name: '', id: '' };
  jobs.set(sid, job);
  const onLine = line => {
    const hit = SECTION_LINE.exec(line);
    if (hit) { job.sections += 1; job.step = `Read ${hit[2]}`; } else if (line.trim()) job.step = clip(line.trim(), 160);
  };
  Promise.resolve()
    .then(() => run({ exoToken, ippsToken, upn, mailbox: '', onLine }))
    .then(async ({ config }) => {
      if (jobs.get(sid) !== job) return;
      job.step = 'Saving';
      const saved = await save(config, { takenBy: upn, label });
      if (jobs.get(sid) !== job) return;
      if (!saved.ok) { Object.assign(job, { state: 'error', finishedAt: now(), step: 'Failed', message: saved.message }); return; }
      const d = describe(config);
      Object.assign(job, { state: 'done', finishedAt: now(), step: 'Done', name: saved.name, id: saved.id, message: `Saved ${saved.name}${saved.where ? ` to ${saved.where}` : ''}: ${d.sections} sections, ${d.ok} with settings, ${d.empty} empty${d.notRead ? `, ${d.notRead} not read` : ''}.` });
    })
    .catch(error => {
      if (jobs.get(sid) !== job) return;
      Object.assign(job, { state: 'error', finishedAt: now(), step: 'Failed', message: clip(error?.message || String(error), 2000) });
    });
  return snapshotStatus(sid);
}
