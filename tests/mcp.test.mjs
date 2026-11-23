import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { handleRpc, listTools, MCP_TOOLS, NotSignedIn, toolText, MAX_TEXT } from '../lib/mcp.js';
import { sampleExport } from '../lib/nexthop-sample.js';
import { SAMPLES } from '../lib/samples.js';

const root = path.resolve(import.meta.dirname, '..');
const noApi = () => { throw new Error('api should not be called'); };
const emptyExports = { folder: '/exports', list: async () => [], read: async () => { throw Object.assign(new Error('nope'), { code: 'ENOENT' }); } };
const call = (name, args, deps) => handleRpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, { api: noApi, exports: emptyExports, ...deps });

test('initialize, ping, tools/list and unknown methods follow JSON-RPC', async () => {
  const init = await handleRpc({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '1' } } }, {});
  assert.equal(init.result.protocolVersion, '2025-03-26');
  assert.equal(init.result.serverInfo.name, 'exchange-360');
  assert.deepEqual(init.result.capabilities, { tools: { listChanged: false } });
  const later = await handleRpc({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2099-01-01' } }, {});
  assert.equal(later.result.protocolVersion, '2025-06-18');
  assert.equal(await handleRpc({ jsonrpc: '2.0', method: 'notifications/initialized' }, {}), null);
  assert.deepEqual((await handleRpc({ jsonrpc: '2.0', id: 2, method: 'ping' }, {})).result, {});
  assert.equal((await handleRpc({ jsonrpc: '2.0', id: 3, method: 'resources/list' }, {})).error.code, -32601);
  assert.equal((await handleRpc({ id: 4, method: 'ping' }, {})).error.code, -32600);
});

test('every tool is read-only, named ex360_*, and has an object input schema', () => {
  const tools = listTools();
  assert.ok(tools.length >= 15);
  for (const t of tools) {
    assert.match(t.name, /^ex360_[a-z_]+$/);
    assert.equal(t.annotations.readOnlyHint, true, t.name);
    assert.equal(t.annotations.destructiveHint, false, t.name);
    assert.equal(t.inputSchema.type, 'object', t.name);
    assert.ok(t.description.length > 30, t.name);
  }
  // No tool name or description offers a change.
  for (const t of MCP_TOOLS) assert.doesNotMatch(`${t.name} ${t.description}`, /\b(set|create|delete|release|remove|enable|disable)-/i);
});

test('header analysis runs offline with no sign-in', async () => {
  const out = await call('ex360_analyze_headers', { headers: SAMPLES.spoof.headers });
  assert.equal(out.result.isError, undefined);
  assert.equal(JSON.parse(out.result.content[0].text).summary.cat, 'SPOOF');
  const empty = await call('ex360_analyze_headers', { headers: '  ' });
  assert.equal(empty.result.isError, true);
});

test('NextHop predicts on the Contoso sample, with scenarios and overrides', async () => {
  const out = await call('ex360_nexthop_predict', { config: 'sample', scenario: 'exe-attachment' });
  const body = JSON.parse(out.result.content[0].text);
  assert.equal(body.source, 'sample');
  assert.match(body.text, /^NextHop prediction \(inbound\)/);
  assert.ok(body.steps.length > 2);
  const outbound = JSON.parse((await call('ex360_nexthop_predict', { config: 'sample', direction: 'outbound', externalAddress: 'someone@outside.example', subject: 'hello', body: 'hi' })).result.content[0].text);
  assert.match(outbound.text, /\(outbound\)/);
  const bad = await call('ex360_nexthop_predict', { config: 'sample', scenario: 'nope' });
  assert.equal(bad.result.isError, true);
  const topo = JSON.parse((await call('ex360_nexthop_topology', { config: 'sample' })).result.content[0].text);
  assert.ok(topo.areas.some(a => a.key === 'transportRules' && a.count > 0));
});

test('NextHop reads export files by name only and refuses paths', async () => {
  const files = { 'mailflow-config-a.json': JSON.stringify({ ...sampleExport(), sample: false }) };
  const exports = { folder: '/exports', list: async () => [{ name: 'mailflow-config-a.json' }], read: async n => { if (!files[n]) throw Object.assign(new Error('x'), { code: 'ENOENT' }); return files[n]; } };
  const ok = JSON.parse((await call('ex360_nexthop_predict', { config: 'mailflow-config-a.json', scenario: 'blocked-ip' }, { exports })).result.content[0].text);
  assert.equal(ok.source, 'export');
  for (const name of ['../etc/passwd.json', '..\\x.json', '/exports/a.json', '.hidden.json', 'notjson.txt']) {
    const r = await call('ex360_nexthop_predict', { config: name }, { exports });
    assert.equal(r.result.isError, true, name);
  }
  const missing = await call('ex360_nexthop_predict', { config: 'other.json' }, { exports });
  assert.match(missing.result.content[0].text, /no export named other\.json/);
  const listed = JSON.parse((await call('ex360_nexthop_list_exports', {}, { exports })).result.content[0].text);
  assert.deepEqual(listed.value.map(r => r.name), ['sample', 'mailflow-config-a.json']);
});

test('tenant tools need the browser sign-in and pass Not authorized through as an error', async () => {
  const signedOut = await call('ex360_org', { part: 'domains' }, { api: () => { throw new NotSignedIn(); } });
  assert.equal(signedOut.result.isError, true);
  assert.match(signedOut.result.content[0].text, /Open http:\/\/localhost:8360/);
  const denied = await call('ex360_quarantine', {}, { api: async () => ({ ok: false, label: 'Not authorized', authorized: false }) });
  assert.equal(denied.result.isError, true);
  const seen = [];
  await call('ex360_message_trace', { sender: 'a@b.example', days: 3, status: '' }, { api: async (p, q) => { seen.push([p, q]); return { ok: true }; } });
  assert.deepEqual(seen, [['/api/trace', { sender: 'a@b.example', days: '3' }]]);
  const short = await call('ex360_search_recipients', { q: 'a' });
  assert.equal(short.result.isError, true);
});

test('status drops the signed-out consent hint once signed in', async () => {
  const on = JSON.parse((await call('ex360_status', {}, { api: async () => ({ signedIn: true, consent: 'Not signed in. Setup steps...' }) })).result.content[0].text);
  assert.equal(on.consent, undefined);
  const off = JSON.parse((await call('ex360_status', {}, { api: async () => ({ signedIn: false, consent: 'Not signed in. Setup steps...' }) })).result.content[0].text);
  assert.match(off.consent, /Not signed in/);
});

test('long answers are cut and say so', () => {
  const text = toolText('x'.repeat(MAX_TEXT + 10));
  assert.ok(text.length < MAX_TEXT + 300);
  assert.match(text, /Cut at/);
});

// End to end: the real server, the stdio bridge, and the key file.
function startServer(env, port) {
  const child = spawn(process.execPath, ['server/index.mjs'], { cwd: root, env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server did not start')), 8000);
    child.stdout.on('data', chunk => { if (String(chunk).includes('listening')) { clearTimeout(timer); resolve(child); } });
    child.on('exit', code => { clearTimeout(timer); reject(new Error(`exited ${code}`)); });
  });
}
function bridge(env, port, lines) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['server/mcp-stdio.mjs'], { cwd: root, env: { ...process.env, PORT: String(port), ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', c => { out += c; });
    child.on('exit', () => resolve(out.trim().split('\n').filter(Boolean).map(l => JSON.parse(l))));
    child.on('error', reject);
    child.stdin.end(lines.map(l => JSON.stringify(l)).join('\n') + '\n');
  });
}

test('stdio bridge reaches /mcp with the key; /mcp refuses callers without it', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ex360-mcp-'));
  const keyFile = path.join(dir, 'key');
  writeFileSync(path.join(dir, 'mailflow-config-test.json'), JSON.stringify({ ...sampleExport(), sample: false }));
  const port = 8471;
  const server = await startServer({ EX360_DEMO: '1', EX360_MCP_TOKEN_FILE: keyFile, EX360_EXPORTS_DIR: dir }, port);
  try {
    assert.equal((readFileSync(keyFile, 'utf8')).length, 43);
    const none = await fetch(`http://127.0.0.1:${port}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"jsonrpc":"2.0","id":1,"method":"ping"}' });
    assert.equal(none.status, 401);
    const evil = await fetch(`http://127.0.0.1:${port}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${readFileSync(keyFile, 'utf8')}`, origin: 'https://evil.example' }, body: '{"jsonrpc":"2.0","id":1,"method":"ping"}' });
    assert.equal(evil.status, 401);
    const answers = await bridge({ EX360_MCP_TOKEN_FILE: keyFile }, port, [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } } },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'ex360_org', arguments: { part: 'domains' } } },
      { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'ex360_nexthop_list_exports', arguments: {} } },
      { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'ex360_nexthop_predict', arguments: { config: 'mailflow-config-test.json', scenario: 'ceo-fraud' } } },
    ]);
    assert.deepEqual(answers.map(a => a.id), [1, 2, 3, 4, 5]);
    assert.equal(answers[0].result.serverInfo.name, 'exchange-360');
    assert.ok(answers[1].result.tools.some(t => t.name === 'ex360_message_trace'));
    const org = JSON.parse(answers[2].result.content[0].text);
    assert.equal(org.source, 'demo');
    assert.ok(org.value.some(d => d.name === 'contoso.com'));
    assert.ok(JSON.parse(answers[3].result.content[0].text).value.some(r => r.name === 'mailflow-config-test.json'));
    assert.equal(JSON.parse(answers[4].result.content[0].text).source, 'export');
  } finally {
    server.kill();
  }
});

test('signed out, tenant tools say Not signed in instead of answering from sample data', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ex360-mcp-'));
  const keyFile = path.join(dir, 'key');
  const port = 8472;
  const server = await startServer({ EX360_DEMO: '', EX360_MCP_TOKEN_FILE: keyFile, EX360_EXPORTS_DIR: dir }, port);
  try {
    const answers = await bridge({ EX360_MCP_TOKEN_FILE: keyFile }, port, [
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'ex360_org', arguments: { part: 'settings' } } },
      { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'ex360_status', arguments: {} } },
    ]);
    assert.equal(answers[0].result.isError, true);
    assert.match(answers[0].result.content[0].text, /Not signed in/);
    assert.equal(JSON.parse(answers[1].result.content[0].text).signedIn, false);
  } finally {
    server.kill();
  }
});

test('the bridge says plainly when Ex360 is not running', async () => {
  const answers = await bridge({ EX360_MCP_TOKEN_FILE: path.join(os.tmpdir(), 'ex360-no-such-key') }, 8473, [{ jsonrpc: '2.0', id: 7, method: 'ping' }]);
  assert.equal(answers[0].id, 7);
  assert.match(answers[0].error.message, /not running/);
});
