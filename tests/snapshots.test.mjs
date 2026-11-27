import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { sampleExport } from '../lib/nexthop-sample.js';
import { diffSnapshots, compareObjects, snapshotFileName, safeSnapshotName, secretsIn, isSnapshotFile } from '../lib/snapshot-diff.js';

const dir = mkdtempSync(path.join(tmpdir(), 'ex360-snap-test-'));
const exportsDir = mkdtempSync(path.join(tmpdir(), 'ex360-exp-test-'));
process.env.EX360_SNAPSHOTS_DIR = dir;
process.env.EX360_EXPORTS_DIR = exportsDir;
const { listSnapshots, readSnapshot, saveSnapshot, startSnapshot, snapshotStatus, snapshotStoreSettings, snapshotStoreClient, snapshotStoreSaver } = await import('../server/snapshots.mjs');
test.after(() => { rmSync(dir, { recursive: true, force: true }); rmSync(exportsDir, { recursive: true, force: true }); });

function changed() {
  const cfg = sampleExport();
  const rules = cfg.sections.transportRules.items;
  rules[0].State = rules[0].State === 'Enabled' ? 'Disabled' : 'Enabled';
  rules[0].WhenChanged = '2030-01-01T00:00:00Z';
  const removed = rules.pop();
  cfg.sections.transportRules.count = rules.length;
  cfg.sections.acceptedDomains.items.push({ Name: 'new.example', DomainName: 'new.example', DomainType: 'Authoritative', Default: false });
  return { cfg, removed };
}

test('a snapshot compared with itself has no changes', () => {
  const d = diffSnapshots(sampleExport(), sampleExport());
  assert.equal(d.ok, true);
  assert.deepEqual([d.totals.added, d.totals.removed, d.totals.changed, d.totals.notComparable], [0, 0, 0, 0]);
});

test('added, removed and changed objects are found, and WhenChanged is not compared', () => {
  const { cfg, removed } = changed();
  const d = diffSnapshots(sampleExport(), cfg);
  const rules = d.sections.find(s => s.name === 'transportRules');
  assert.equal(rules.removed, 1);
  assert.equal(rules.changed, 1);
  assert.ok(rules.objects.some(o => o.change === 'Removed' && o.name === removed.Name));
  const c = rules.objects.find(o => o.change === 'Changed');
  assert.deepEqual(c.changes.map(x => x.property), ['State']);
  const domains = d.sections.find(s => s.name === 'acceptedDomains');
  assert.equal(domains.added, 1);
  assert.equal(domains.objects[0].name, 'new.example');
  assert.equal(d.totals.changedSections, 2);
});

test('a section that was not read on one side is reported, not treated as empty', () => {
  const after = sampleExport();
  after.sections.dlpPolicies = { ...after.sections.dlpPolicies, status: 'skipped', items: [], count: 0 };
  const d = diffSnapshots(sampleExport(), after);
  const dlp = d.sections.find(s => s.name === 'dlpPolicies');
  assert.equal(dlp.comparable, false);
  assert.equal(dlp.removed, 0);
  assert.equal(d.totals.notComparable, 1);
});

test('the order of plain lists is ignored; nested values compare property by property', () => {
  assert.deepEqual(compareObjects({ IPAllowList: ['1.1.1.1', '2.2.2.2'] }, { IPAllowList: ['2.2.2.2', '1.1.1.1'] }), []);
  assert.deepEqual(compareObjects({ a: { b: 1, c: 2 } }, { a: { b: 1, c: 3 } }), [{ property: 'a.c', before: '2', after: '3' }]);
});

test('files that are not snapshots are refused', () => {
  assert.equal(isSnapshotFile({ format: 'other', version: 1, sections: {} }), false);
  assert.equal(diffSnapshots({}, sampleExport()).ok, false);
});

test('snapshot names are safe and never reach outside the folder', () => {
  assert.equal(snapshotFileName('Contoso.onmicrosoft.com', '2026-11-26T19:05:07Z'), 'ex360-snapshot-contoso.onmicrosoft.com-20261126-190507.json');
  assert.equal(safeSnapshotName('../etc/passwd.json'), '');
  assert.equal(safeSnapshotName('a/b.json'), '');
  assert.equal(safeSnapshotName('ok-file.json'), 'ok-file.json');
});

test('reading never leaves the folders', async () => {
  assert.equal((await readSnapshot('snapshot:../../x.json')).ok, false);
  assert.equal((await readSnapshot('other:x.json')).ok, false);
  assert.equal((await readSnapshot('snapshotStore:x.json')).ok, false);
});

test('a snapshot with text shaped like a secret is never written', () => {
  const cfg = sampleExport();
  cfg.sections.inboundConnectors.items.push({ Name: 'bad', Comment: ['ey', 'JhbGciOiJIUzI1NiJ9.', 'eyJzdWIiOiIxMjM0NTY3ODkwIn0.', 'abcdefghijklmnop'].join('') });
  const before = readdirSync(dir).length;
  const r = saveSnapshot(cfg, { takenBy: 'a@b.c' });
  assert.equal(r.ok, false);
  assert.match(r.message, /JSON Web Token/);
  assert.equal(readdirSync(dir).length, before);
  assert.deepEqual(secretsIn(['-----BEGIN RSA ', 'PRIVATE KEY-----'].join('')), ['private key block']);
});

test('saved snapshots and export files are listed newest first and can be compared', async () => {
  const a = saveSnapshot(sampleExport(), { takenBy: 'admin@contoso.com', label: 'Before', now: new Date('2026-11-20T10:00:00Z') });
  const b = saveSnapshot(changed().cfg, { takenBy: 'admin@contoso.com', label: 'After', now: new Date('2026-11-21T10:00:00Z') });
  assert.ok(a.ok && b.ok);
  writeFileSync(path.join(exportsDir, 'mailflow-config-x.json'), JSON.stringify({ ...sampleExport(), generatedAt: '2026-11-19T10:00:00Z' }));
  writeFileSync(path.join(dir, 'notes.json'), '{"hello":1}');
  const list = await listSnapshots();
  assert.deepEqual(list.value.map(s => s.label || s.source), ['After', 'Before', 'export']);
  assert.equal(list.skipped, 1);
  const saved = JSON.parse(readFileSync(path.join(dir, a.name), 'utf8'));
  assert.equal(saved.snapshot.takenBy, 'admin@contoso.com');
  assert.equal(saved.snapshot.readOnly, true);
  const d = diffSnapshots((await readSnapshot(a.id)).cfg, (await readSnapshot(b.id)).cfg);
  assert.equal(d.before.label, 'Before');
  assert.equal(d.totals.removed, 1);
});

test('one click runs the read-only export once per session and saves the file', async () => {
  let calls = 0;
  const run = async ({ onLine, mailbox }) => { calls += 1; assert.equal(mailbox, ''); onLine('  OK      transportRules'); return { code: 0, config: sampleExport() }; };
  let saved = null;
  const save = (cfg, opts) => { saved = opts; return { ok: true, name: 'x.json', id: 'snapshot:x.json' }; };
  const first = startSnapshot('s1', { exoToken: 't', upn: 'admin@contoso.com', label: 'L', run, save });
  assert.equal(first.state, 'running');
  assert.equal(startSnapshot('s1', { exoToken: 't', upn: 'admin@contoso.com', run, save }).state, 'running');
  await new Promise(r => setTimeout(r, 20));
  const done = snapshotStatus('s1');
  assert.equal(done.state, 'done');
  assert.equal(done.id, 'snapshot:x.json');
  assert.equal(calls, 1);
  assert.deepEqual(saved, { takenBy: 'admin@contoso.com', label: 'L' });
  assert.equal(startSnapshot('s2', { exoToken: '', upn: 'a@b.c', run, save }).state, 'error');
});

test('the snapshots folder is mounted read-write and exports stay read-only', () => {
  const compose = readFileSync(new URL('../docker-compose.yml', import.meta.url), 'utf8');
  assert.match(compose, /Ex360-snapshots\}?:\/snapshots"/);
  assert.match(compose, /EX360_SNAPSHOTS_DIR: \/snapshots/);
  assert.match(compose, /Ex360-exports\}:\/exports:ro/);
});

test('snapshotStore settings need an https address and the Snapshots.ReadWrite scope', () => {
  assert.equal(snapshotStoreSettings({}).configured, false);
  assert.equal(snapshotStoreSettings({}).problem, '');
  const ok = snapshotStoreSettings({ SNAPSHOT_STORE_URL: 'https://snapshot-store.example.azurecontainerapps.io/', SNAPSHOT_STORE_API_SCOPE: 'api://aaaaaaaa-0000-4000-8000-00000000c0de/Snapshots.ReadWrite' });
  assert.equal(ok.configured, true);
  assert.equal(ok.url, 'https://snapshot-store.example.azurecontainerapps.io');
  assert.equal(snapshotStoreSettings({ SNAPSHOT_STORE_URL: 'http://host.docker.internal:3660', SNAPSHOT_STORE_API_SCOPE: 'api://aaaaaaaa-0000-4000-8000-00000000c0de/Snapshots.ReadWrite' }).configured, true);
  assert.equal(snapshotStoreSettings({ SNAPSHOT_STORE_URL: 'http://store.example:3660', SNAPSHOT_STORE_API_SCOPE: 'api://aaaaaaaa-0000-4000-8000-00000000c0de/Snapshots.ReadWrite' }).configured, false);
  const bad = snapshotStoreSettings({ SNAPSHOT_STORE_URL: 'http://evil.example', SNAPSHOT_STORE_API_SCOPE: 'x' });
  assert.equal(bad.configured, false);
  assert.match(bad.problem, /not valid/);
});

function fakeSnapshotStore() {
  const stored = new Map();
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url, method: init.method, auth: init.headers.authorization });
    const reply = (status, body) => ({ ok: status < 300, status, json: async () => body });
    const p = new URL(url).pathname;
    if (init.method === 'POST') { const cfg = JSON.parse(init.body); stored.set(cfg.snapshot.name, cfg); return reply(200, { ok: true, name: cfg.snapshot.name, commit: 'abcdef1234567', repo: 'contoso/ex360-snapshots' }); }
    if (p === '/api/ex360/snapshots') return reply(200, { ok: true, value: [...stored.values()].map(c => ({ name: c.snapshot.name, takenAt: c.snapshot.takenAt, label: c.snapshot.label })) });
    const name = decodeURIComponent(p.split('/').pop());
    return stored.has(name) ? reply(200, stored.get(name)) : reply(404, { ok: false, message: `${name} is not in snapshotStore.` });
  };
  const settings = { configured: true, url: 'https://store.example', scope: 'api://x/Snapshots.ReadWrite' };
  return { client: snapshotStoreClient({ settings, token: async () => 'tok', fetcher }), calls, stored };
}

test('with snapshotStore set up, a snapshot goes to snapshotStore only, with the bearer token, and is listed and read back from there', async () => {
  const { client, calls, stored } = fakeSnapshotStore();
  const before = readdirSync(dir).length;
  const saved = await snapshotStoreSaver(client)(sampleExport(), { takenBy: 'admin@contoso.com', label: 'In snapshotStore', now: new Date('2026-11-27T10:00:00Z') });
  assert.equal(saved.ok, true);
  assert.match(saved.id, /^snapshotStore:ex360-snapshot-/);
  assert.match(saved.where, /contoso\/ex360-snapshots, commit abcdef1/);
  assert.equal(readdirSync(dir).length, before, 'nothing is written on the PC');
  assert.equal(calls[0].auth, 'Bearer tok');
  const body = [...stored.values()][0];
  assert.equal(body.readOnly, true);
  assert.equal(body.snapshot.name, saved.name);
  const list = await listSnapshots({ snapshotStore: client });
  assert.equal(list.store, 'snapshotStore');
  assert.ok(list.value.some(s => s.id === saved.id && s.source === 'snapshotStore'));
  assert.ok(!list.value.some(s => s.source === 'snapshot'), 'PC snapshots are not listed when snapshotStore is the store');
  const got = await readSnapshot(saved.id, { snapshotStore: client });
  assert.equal(got.ok, true);
  assert.equal(got.cfg.snapshot.label, 'In snapshotStore');
  assert.match((await readSnapshot('snapshotStore:ex360-snapshot-x-20260101-000000.json', { snapshotStore: client })).message, /not in snapshotStore/);
});

test('an snapshotStore refusal is shown with its reason and nothing is saved', async () => {
  const client = snapshotStoreClient({ settings: { url: 'https://store.example' }, token: async () => 'tok', fetcher: async () => ({ ok: false, status: 403, json: async () => ({ ok: false, message: 'Saving a snapshot needs the author or admin role in approvers.json.' }) }) });
  const saved = await snapshotStoreSaver(client)(sampleExport(), {});
  assert.equal(saved.ok, false);
  assert.match(saved.message, /author or admin role/);
  const list = await listSnapshots({ snapshotStore: client });
  assert.match(list.problems.join(' '), /could not be read: Saving a snapshot needs/);
});
