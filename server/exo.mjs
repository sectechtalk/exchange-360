import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { notAuthorized } from '../lib/permissions.js';
import { consentGap } from '../lib/tokenclaims.js';
import { clip } from '../lib/logsafe.js';
import { logPowershellFailure } from './log.mjs';

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'Invoke-Ex360Command.ps1');

export const EXO_MODES = ['ping', 'org', 'mailbox', 'report', 'trace', 'migrations', 'exoroles', 'adminaudit', 'ipps', 'govern', 'recipients', 'quarantine', 'search', 'rights'];
// Modes that connect to Security & Compliance PowerShell with the compliance token.
const IPPS_MODES = new Set(['ipps', 'govern']);

export function exoAvailable() {
  return process.env.EX360_EXO === '0' ? false : true;
}

function withPowershellDetail(mode, message) {
  const text = clip(message || '');
  const unauthorized = /unauthor|not authorized|access denied|forbidden/i.test(text);
  if (!unauthorized) return { ok: false, message: text, detail: text };
  const card = notAuthorized(IPPS_MODES.has(mode) ? 'ipps' : mode === 'trace' ? 'trace' : 'exchange');
  card.detail = text;
  return card;
}

export function runExo({ token, organization, userPrincipalName = '', clientId = '', mode, args = {}, timeoutMs = 180000 }) {
  if (!EXO_MODES.includes(mode)) return Promise.resolve({ ok: false, message: 'That Exchange command is not in the read-only list.' });
  if (!token) return Promise.resolve(notAuthorized(IPPS_MODES.has(mode) ? 'ipps' : 'exchange'));
  const gap = consentGap(token, IPPS_MODES.has(mode) ? 'compliance' : 'exchange', clientId);
  if (gap) return Promise.resolve(gap);
  const dir = mkdtempSync(path.join(tmpdir(), 'ex360-'));
  const tokenPath = path.join(dir, 'token');
  const argsPath = path.join(dir, 'args.json');
  writeFileSync(tokenPath, token, { mode: 0o600 });
  writeFileSync(argsPath, JSON.stringify(args));
  const upn = String(userPrincipalName || '');
  return new Promise(resolve => {
    const child = spawn('pwsh', ['-NoProfile', '-NonInteractive', '-File', script, '-TokenPath', tokenPath, '-Organization', organization || '', '-UserPrincipalName', upn, '-Mode', mode, '-ArgsPath', argsPath], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill();
      logPowershellFailure(mode, 'Exchange Online PowerShell did not finish in time.');
      resolve({ ok: false, message: 'Exchange Online PowerShell did not finish in time.' });
    }, timeoutMs);
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { err += d; });
    child.on('error', error => {
      clearTimeout(timer);
      rmSync(dir, { recursive: true, force: true });
      logPowershellFailure(mode, error.message || error.code || 'PowerShell 7 is not available');
      resolve({ ok: false, available: false, message: `PowerShell 7 is not available here (${error.code || error.message}). The Docker image includes it. Until then this section stays on demo data or shows this message.` });
    });
    child.on('close', code => {
      clearTimeout(timer);
      rmSync(dir, { recursive: true, force: true });
      const line = out.trim().split('\n').filter(Boolean).pop() || '';
      try {
        const json = JSON.parse(line);
        if (json && json.ok === false) {
          const text = json.detail || json.message || 'PowerShell returned ok:false';
          logPowershellFailure(mode, text);
          resolve(json.authorized === false || /unauthor/i.test(text) ? withPowershellDetail(mode, text) : { ...json, detail: clip(text) });
          return;
        }
        resolve(json);
      } catch {
        const text = `${err}\n${out}`;
        logPowershellFailure(mode, text || `Exchange Online PowerShell exited ${code}.`);
        resolve(withPowershellDetail(mode, text || `Exchange Online PowerShell exited ${code}.`));
      }
    });
  });
}
