import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';

const port = 8391;
function start() {
  const child = spawn(process.execPath, ['server/index.mjs'], {
    cwd: path.resolve(import.meta.dirname, '..'),
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', EX360_DEMO: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server did not start')), 8000);
    child.stdout.on('data', chunk => {
      if (String(chunk).includes('listening')) { clearTimeout(timer); resolve(child); }
    });
    child.on('exit', code => { clearTimeout(timer); reject(new Error(`exited ${code}`)); });
  });
}

test('demo server renders the shell and the sample analysis', async () => {
  const child = await start();
  try {
    const base = `http://127.0.0.1:${port}`;
    const health = await fetch(`${base}/healthz`);
    assert.equal((await health.json()).name, 'exchange-360');
    const home = await fetch(`${base}/`);
    const html = await home.text();
    assert.match(html, /Exchange 360/);
    assert.match(html, /id="page-title"/);
    assert.match(html, /data-view="hops"/);
    const session = await (await fetch(`${base}/api/session`)).json();
    assert.equal(session.signedIn, false);
    assert.match(session.consent, /Setup steps/);
    assert.equal(session.staleCookie, false);
    const org = await (await fetch(`${base}/api/org?demo=1`)).json();
    assert.equal(org.source, 'demo');
    assert.ok(org.domains.some(d => d.name === 'contoso.com'));
    const box = await (await fetch(`${base}/api/mailbox?id=megan.bowen@contoso.com&demo=1`)).json();
    assert.equal(box.view.mailbox.displayName, 'Megan Bowen');
    const report = await (await fetch(`${base}/api/report?id=megan.bowen@contoso.com&demo=1&tz=America/Los_Angeles`)).json();
    assert.equal(report.report.subject.displayName, 'Megan Bowen');
    const pdf = await fetch(`${base}/api/report.pdf?id=megan.bowen@contoso.com&demo=1&tz=America/Los_Angeles`);
    assert.equal(pdf.headers.get('content-type'), 'application/pdf');
    assert.match(pdf.headers.get('content-disposition'), /attachment; filename="Ex360-mailbox-report-megan\.bowen-\d{4}-\d{2}-\d{2}-DEMO\.pdf"/);
    assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString('latin1'), '%PDF-');
    const sample = await (await fetch(`${base}/api/sample?id=spoof`)).json();
    assert.equal(sample.analysis.summary.cat, 'SPOOF');
    const denied = await fetch(`${base}/api/org`, { method: 'PUT' });
    assert.equal(denied.status, 405);
    const font = await fetch(`${base}/fonts/InterVariable.woff2`);
    assert.equal(font.status, 200);
    const script = await fetch(`${base}/lib/analyzer.js`);
    assert.equal(script.status, 200);
  } finally {
    child.kill();
  }
});
