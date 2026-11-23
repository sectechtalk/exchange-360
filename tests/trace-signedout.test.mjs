// A trace for a real message is never answered from the Contoso sample because the sign-in is missing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { detailMismatch, signedOutTrace } from '../lib/trace.js';

const port = 8393;
function start() {
  const env = { ...process.env, PORT: String(port), HOST: '127.0.0.1' };
  delete env.EX360_DEMO;
  const child = spawn(process.execPath, ['server/index.mjs'], { cwd: path.resolve(import.meta.dirname, '..'), env, stdio: ['ignore', 'pipe', 'pipe'] });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server did not start')), 8000);
    child.stdout.on('data', chunk => { if (String(chunk).includes('listening')) { clearTimeout(timer); resolve(child); } });
    child.on('exit', code => { clearTimeout(timer); reject(new Error(`exited ${code}`)); });
  });
}

test('signed out: /api/trace says Signed out instead of returning empty demo rows', async () => {
  const child = await start();
  try {
    const base = `http://127.0.0.1:${port}`;
    const qs = new URLSearchParams({ recipient: 'megan.bowen@contoso.com', messageTraceId: 'aaaaaaaa-0000-4000-8000-0000000000a5', messageId: '<x@y>', related: '1', days: '2' });
    const out = await (await fetch(`${base}/api/trace?${qs}`)).json();
    assert.equal(out.signedOut, true);
    assert.equal(out.ok, false);
    assert.equal(out.commands, undefined);
    assert.match(out.message, /Sign in/);
    const demo = await (await fetch(`${base}/api/trace?${qs}&demo=1`)).json();
    assert.equal(demo.source, 'demo');
  } finally {
    child.kill();
  }
});

test('a demo answer to a live row is flagged as a sign-in problem', () => {
  assert.equal(detailMismatch('live', { source: 'demo' }), true);
  assert.equal(detailMismatch('live', { source: 'live' }), false);
  assert.equal(detailMismatch('demo', { source: 'demo' }), false);
  assert.match(signedOutTrace().message, /docker compose up/);
});
