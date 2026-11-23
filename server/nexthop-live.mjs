// NextHop live read: one background job per signed-in session that runs the read-only mail flow export
// (export/Export-MailFlowConfig.ps1, through server/Invoke-Ex360NextHop.ps1) with the person's own Exchange and
// compliance tokens. The page starts it, can be left while it runs, and is told when it finishes. The result is
// kept in memory only, for this session, until the next read or sign-out. Nothing is written to the tenant.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { clip } from '../lib/logsafe.js';

const wrapper = path.join(path.dirname(fileURLToPath(import.meta.url)), 'Invoke-Ex360NextHop.ps1');
const jobs = new Map();
const SECTION_LINE = /^\s+(OK|EMPTY|ERROR|UNAVAILABLE|SKIPPED)\s+(\S+)/;

// The public view of a job: no tokens, and the configuration only when asked for.
export function liveStatus(sid, { withConfig = false } = {}) {
  const job = jobs.get(sid);
  if (!job) return { state: 'none' };
  const { state, startedAt, finishedAt, sections, step, message, mailbox, total } = job;
  return { state, startedAt, finishedAt, sections, total, step, message, mailbox, ...(withConfig && job.config ? { config: job.config } : {}) };
}

export function forgetLive(sid) { jobs.delete(sid); }

/**
 * Starts a live read unless one is already running for this session. run is injectable for tests:
 * run({ exoToken, ippsToken, upn, mailbox, onLine }) resolves { code, config } or rejects.
 */
export function startLive(sid, { exoToken, ippsToken, upn, mailbox = '', total = 0, run = runExport, now = () => new Date().toISOString() }) {
  const current = jobs.get(sid);
  if (current?.state === 'running') return liveStatus(sid);
  if (!exoToken || !upn) return { state: 'error', message: 'Sign in to Exchange Online first: the live read uses your own Exchange sign-in.' };
  const job = { state: 'running', startedAt: now(), finishedAt: '', sections: 0, total, step: 'Starting PowerShell', message: '', mailbox: mailbox || upn, config: null };
  jobs.set(sid, job);
  const onLine = line => {
    const hit = SECTION_LINE.exec(line);
    if (hit) { job.sections += 1; job.step = `Read ${hit[2]}`; } else if (line.trim()) job.step = clip(line.trim(), 160);
  };
  Promise.resolve()
    .then(() => run({ exoToken, ippsToken, upn, mailbox, onLine }))
    .then(({ config }) => {
      if (jobs.get(sid) !== job) return;
      Object.assign(job, { state: 'done', finishedAt: now(), config, step: 'Done', message: summaryText(config) });
    })
    .catch(error => {
      if (jobs.get(sid) !== job) return;
      Object.assign(job, { state: 'error', finishedAt: now(), step: 'Failed', message: clip(error?.message || String(error), 2000) });
    });
  return liveStatus(sid);
}

function summaryText(cfg) {
  const s = cfg?.summary || {};
  const notRead = (s.error || 0) + (s.unavailable || 0) + (s.skipped || 0);
  return `${s.sections ?? '?'} sections: ${s.ok ?? 0} with settings, ${s.empty ?? 0} empty${notRead ? `, ${notRead} not read` : ''}.`;
}

export function runExport({ exoToken, ippsToken, upn, mailbox, onLine, timeoutMs = 15 * 60 * 1000 }) {
  const dir = mkdtempSync(path.join(tmpdir(), 'ex360-nexthop-'));
  const exoPath = path.join(dir, 'exo');
  const ippsPath = path.join(dir, 'ipps');
  const outPath = path.join(dir, 'mailflow-config.json');
  writeFileSync(exoPath, exoToken, { mode: 0o600 });
  if (ippsToken) writeFileSync(ippsPath, ippsToken, { mode: 0o600 });
  const args = ['-NoProfile', '-NonInteractive', '-File', wrapper, '-ExoTokenPath', exoPath, '-UserPrincipalName', upn, '-OutputPath', outPath];
  if (ippsToken) args.push('-IppsTokenPath', ippsPath);
  if (mailbox) args.push('-Mailbox', mailbox);
  return new Promise((resolve, reject) => {
    const child = spawn('pwsh', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let buffer = '';
    let err = '';
    const timer = setTimeout(() => child.kill(), timeoutMs);
    const lines = chunk => {
      buffer += chunk;
      const parts = buffer.split(/\r?\n/);
      buffer = parts.pop();
      for (const line of parts) onLine(line.replace(/\x1b\[[0-9;]*m/g, ''));
    };
    child.stdout.on('data', lines);
    child.stderr.on('data', d => { err += d; });
    const done = fn => { clearTimeout(timer); try { fn(); } finally { rmSync(dir, { recursive: true, force: true }); } };
    child.on('error', error => done(() => reject(new Error(`PowerShell 7 is not available here (${error.code || error.message}). The Docker image includes it.`))));
    child.on('close', code => done(() => {
      let config = null;
      try { config = JSON.parse(readFileSync(outPath, 'utf8')); } catch { /* no file */ }
      // Exit 1 means the file was written but some sections were not read; NextHop lists them.
      if (config) resolve({ code, config });
      else reject(new Error(clip(err.trim() || `The live read stopped (exit ${code}) before it wrote the configuration.`, 2000)));
    }));
  });
}
