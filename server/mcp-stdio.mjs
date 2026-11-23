// Exchange 360 MCP over stdio. An AI client starts this inside the running container:
//   docker exec -i exchange-360 node server/mcp-stdio.mjs
// It reads one JSON-RPC message per line on stdin, passes each to the Ex360 server's /mcp endpoint with the key
// the server wrote at start, and writes each answer as one line on stdout. Nothing else is written to stdout.
// See docs/mcp.md.
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import os from 'node:os';
import path from 'node:path';

const PORT = Number(process.env.PORT || 8360);
const ENDPOINT = process.env.EX360_MCP_URL || `http://127.0.0.1:${PORT}/mcp`;
const TOKEN_FILE = process.env.EX360_MCP_TOKEN_FILE || path.join(os.tmpdir(), 'ex360-mcp.token');

const write = obj => process.stdout.write(`${JSON.stringify(obj)}\n`);
const fail = (id, message) => write({ jsonrpc: '2.0', id: id ?? null, error: { code: -32603, message } });

function token() {
  try { return readFileSync(TOKEN_FILE, 'utf8').trim(); } catch { return ''; }
}

let queue = Promise.resolve();
const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', line => {
  if (!line.trim()) return;
  queue = queue.then(() => forward(line));
});
rl.on('close', () => { queue.then(() => process.exit(0)); });

async function forward(line) {
  let msg;
  try { msg = JSON.parse(line); } catch { write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); return; }
  const id = Array.isArray(msg) ? null : msg.id;
  const key = token();
  if (!key) { if (id !== undefined) fail(id, `Exchange 360 is not running in this container (no key at ${TOKEN_FILE}). Start it with docker compose up -d.`); return; }
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${key}` },
      body: line,
    });
    if (res.status === 202) return;
    const text = await res.text();
    if (!text) return;
    try { write(JSON.parse(text)); } catch { if (id !== undefined) fail(id, `Exchange 360 answered ${res.status}: ${text.slice(0, 300)}`); }
  } catch (error) {
    if (id !== undefined) fail(id, `Exchange 360 did not answer at ${ENDPOINT}: ${error.message}`);
  }
}
