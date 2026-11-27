// Troubleshoot > NextHop: predict what Exchange Online would do with one test message, from configuration only.
// The configuration is either the built-in Contoso sample topology (chosen on purpose, never shown just because
// you are signed out) or an export file you open from your PC (export/Export-MailFlowConfig.ps1). Both are read in
// the browser; nothing is uploaded, sent or saved. The engine is lib/nexthop.js, the report lib/nexthop-report.js.
import { predict, checkExport, orgOf, items, topologyRows, topologyStages, TOPOLOGY_OUTSIDE, nextHopText, stepPortalKinds, VERDICTS, AUTH_RESULTS, MESSAGE_KINDS } from '/lib/nexthop.js';
import { portalLinks, linkTitle } from '/lib/object-links.js';
import { sampleExport, SAMPLE_MAILBOX } from '/lib/nexthop-sample.js';
import { SCENARIOS } from '/lib/nexthop-scenarios.js';
import { nextHopMhtml, nextHopFileName } from '/lib/nexthop-report.js';
import { inputFromMessage } from '/lib/message-input.js';
import { parseMessageFile } from '/lib/message.js';
import { messagePathPanel } from './message-path-view.js';
import { portalBlock, chipClass, chipText } from './portal-block.js';
import { openDetails } from './grid.js';

const STATUS_WORDS = { ok: 'Read', empty: 'Read, none configured', error: 'Error', unavailable: 'Not available', skipped: 'Skipped', missing: 'Not in the file' };
const TONE_TAG = { ok: ['ok', 'OK'], info: ['info', 'INFO'], medium: ['medium', 'CHECK'], high: ['high', 'STOP'] };
const EXPORT_COMMAND = 'cd $HOME\\exchange-360\npwsh -File .\\export\\Export-MailFlowConfig.ps1 -UserPrincipalName you@yourdomain.com';

// Kept for the visit, so leaving the page and coming back keeps the configuration, the form and the last result.
// It is also saved in this browser (IndexedDB, on your PC only), so a refresh comes back to the same configuration
// and form instead of an empty page. "Close" removes it.
const nh = { cfg: null, label: '', fileName: '', input: null, result: null, restored: false };
const STORE = { db: 'ex360-nexthop', table: 'state', key: 'current' };

function idb() {
  return new Promise((resolve, reject) => {
    try {
      const open = indexedDB.open(STORE.db, 1);
      open.onupgradeneeded = () => open.result.createObjectStore(STORE.table);
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    } catch (error) { reject(error); }
  });
}
async function saveState() {
  try {
    const db = await idb();
    const tx = db.transaction(STORE.table, 'readwrite');
    if (nh.cfg) tx.objectStore(STORE.table).put({ cfg: nh.cfg.sample && !nh.fileName ? 'sample' : nh.cfg, label: nh.label, fileName: nh.fileName, input: nh.input, liveFinishedAt: nh.liveFinishedAt || '' }, STORE.key);
    else tx.objectStore(STORE.table).put({ cfg: null, liveFinishedAt: nh.liveFinishedAt || '' }, STORE.key);
    db.close();
  } catch { /* private window or storage blocked: the page still works, it just forgets on refresh */ }
}
async function restoreState() {
  try {
    const db = await idb();
    const saved = await new Promise(resolve => {
      const req = db.transaction(STORE.table).objectStore(STORE.table).get(STORE.key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
    db.close();
    nh.liveFinishedAt = saved?.liveFinishedAt || '';
    if (!saved?.cfg) return false;
    Object.assign(nh, { cfg: saved.cfg === 'sample' ? sampleExport() : saved.cfg, label: saved.label || '', fileName: saved.fileName || '', input: saved.input || null, liveFinishedAt: saved.liveFinishedAt || '', result: null });
    return true;
  } catch { return false; }
}

// ---------------------------------------------------------------- Live read watcher
// A live read runs on the Exchange 360 server and takes a minute or more. The watcher keeps polling after you leave
// NextHop for another page, and when the read finishes it shows a bubble in the corner of whatever Exchange 360 page
// is open, plus a Windows notification if you allowed them and the tab is in the background. Reads under 10 seconds
// get no bubble: you are still looking at the page.
const QUICK_MS = 10000;
const live = { status: null, timer: 0, startedHere: 0, onPage: null };

async function getLive(query = '') {
  const res = await fetch(`/api/nexthop/live${query}`, { headers: { accept: 'application/json' } });
  return res.json();
}
function emitLive() { if (live.onPage) Promise.resolve(live.onPage(live.status)).catch(() => {}); }
function watchLive() {
  clearTimeout(live.timer);
  live.timer = setTimeout(async () => {
    try { live.status = await getLive(); } catch { live.timer = 0; watchLive(); return; }
    emitLive();
    if (live.status?.state === 'running') { watchLive(); return; }
    live.timer = 0;
    if (live.status?.state === 'done' || live.status?.state === 'error') announceLive(live.status);
  }, 2000);
}
function announceLive(status) {
  const took = Date.parse(status.finishedAt || '') - Date.parse(status.startedAt || '');
  if (!live.startedHere || !(took >= QUICK_MS)) return;
  live.startedHere = 0;
  const ok = status.state === 'done';
  const title = ok ? 'NextHop: live read finished' : 'NextHop: live read failed';
  const body = ok ? `${status.mailbox}. ${status.message} Open NextHop to run checks.` : status.message;
  const onPage = location.hash.replace(/^#/, '').split(/[?&]/)[0] === 'nexthop';
  if (!onPage || document.hidden) toast(title, body, ok);
  if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
    try {
      const n = new Notification(title, { body, tag: 'ex360-nexthop', icon: '/favicon.svg' });
      n.onclick = () => { window.focus(); location.hash = '#nexthop'; n.close(); };
    } catch { /* notifications blocked */ }
  }
}
function toast(title, body, ok) {
  document.querySelector('.nh-toast')?.remove();
  const open = document.createElement('a');
  open.className = 'btn primary sm';
  open.href = '#nexthop';
  open.textContent = 'Open NextHop';
  const close = document.createElement('button');
  close.className = 'btn sm';
  close.type = 'button';
  close.textContent = 'Dismiss';
  const box = document.createElement('div');
  box.className = `nh-toast ${ok ? 'ok' : 'crit'}`;
  box.setAttribute('role', 'status');
  const strong = document.createElement('strong');
  strong.textContent = title;
  const text = document.createElement('p');
  text.textContent = body;
  const row = document.createElement('div');
  row.className = 'row';
  row.append(open, close);
  box.append(strong, text, row);
  open.addEventListener('click', () => box.remove());
  close.addEventListener('click', () => box.remove());
  document.body.append(box);
}

function blankInput() {
  return { direction: 'inbound', externalAddress: 'someone@outside.example', fromName: '', ip: '198.51.100.20', auth: 'pass', verdict: 'clean', bcl: '', malware: false, label: '', kind: 'normal', subject: '', body: '', attachments: '' };
}

function download(el, name, text, type) {
  const href = URL.createObjectURL(new Blob([text], { type }));
  const a = el('a', { href, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 60000);
}

export function renderNextHop(ctx) {
  const { el, panel, h2, p, note, table, busy, flash, objCell, pageEl, steps, session = {}, recipient = null, picker = null, notApplicable = null } = ctx;
  const root = el('div', { class: 'stack' });
  // The recipient opened in SINGLE RECIPIENT > Recipient. NextHop reads that mailbox from the live tenant, so every
  // prediction uses its own inbox rules, forwarding, junk settings and holds.
  const wanted = recipient && (!recipient.kind || recipient.kind === 'mailbox') ? String(recipient.primary || '').toLowerCase() : '';
  async function startLive(address) {
    const status = await getLive(`?start=1&mailbox=${encodeURIComponent(address)}`);
    live.startedHere = Date.now();
    live.status = status;
    emitLive();
    if (status.state === 'running') watchLive();
    return status;
  }
  const pause = () => new Promise(resolve => setTimeout(resolve, 150));

  // ---------------------------------------------------------------- Configuration
  function configPanel() {
    const status = el('p', { class: 'muted', role: 'status' });
    const fileInput = el('input', { type: 'file', accept: '.json,application/json', class: 'visually-hidden', 'aria-label': 'Export file' });
    const openSample = el('button', { class: 'btn primary', type: 'button', text: nh.cfg?.sample ? 'Reload the Contoso sample topology' : 'Open the Contoso sample topology' });
    const openFile = el('button', { class: 'btn', type: 'button', text: nh.cfg && !nh.cfg.sample ? 'Open another export file' : 'Open an export file (.json)' });
    openSample.addEventListener('click', () => busy(openSample, 'Opening…', async () => {
      await pause();
      load(sampleExport(), 'Contoso sample topology', '', { announce: true });
    }));
    openFile.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      busy(openFile, 'Reading the file…', async () => {
        let cfg;
        try { cfg = JSON.parse(await file.text()); } catch (error) { status.textContent = `${file.name} is not a JSON file NextHop can read: ${error.message}`; return; }
        const check = checkExport(cfg);
        if (!check.ok) { status.textContent = `${file.name} was not opened. ${check.message}`; return; }
        // Only the downloaded Contoso sample carries sample: true; a real export never does.
        cfg.sample = cfg.sample === true && /sample/i.test(String(cfg.generator?.name || ''));
        load(cfg, `export of ${cfg.tenant?.organization || cfg.tenant?.defaultDomain || 'a tenant'}`, file.name, { announce: true });
      });
      fileInput.value = '';
    });
    const kids = [h2('Configuration')];
    // Opening a file or the sample says so in words, so it is never a silent change (owner, 2026-11-27: "This didn't give
    // me any indication that it worked.").
    if (nh.cfg && nh.notice) kids.push(el('div', { class: 'callout ok', role: 'status' }, el('strong', { text: nh.notice.title }), p(nh.notice.text)));
    if (!nh.cfg) {
      kids.push(p('NextHop needs a mail flow configuration to predict from. Choose one. Nothing in any tenant is changed.'));
      kids.push(steps([
        'Read your live tenant now, with your own sign-in: the same read-only Get- reads as the export, run by Exchange 360. No file to make or open.',
        'Or open the Contoso sample topology: a fictional organization with connectors, mail flow rules, DLP, sensitivity labels, retention, journaling, quarantine and every protection policy, written in exactly the shape of a real export.',
        'Or open an export file from your own tenant, made by Export-MailFlowConfig.ps1 (read-only). The file stays in this browser. See "How to export your tenant" below.',
      ]));
    } else if (nh.cfg.live) {
      const org = orgOf(nh.cfg);
      const s = nh.cfg.summary || {};
      const notRead = Object.entries(nh.cfg.sections || {}).filter(([, v]) => !['ok', 'empty'].includes(v.status));
      kids.push(el('div', { class: 'callout ok', role: 'status' }, el('strong', { text: `Live read of ${nh.cfg.tenant?.organization || 'your tenant'}` }), p(`Mailbox ${org.mailbox.primary}; read ${String(nh.cfg.generatedAt || '').slice(0, 16).replace('T', ' ')} UTC as ${nh.cfg.tenant?.signedInAs || 'you'}. ${s.ok ?? '?'} sections read with settings, ${s.empty ?? '?'} read and empty, ${notRead.length} not read. Settings changed since then need a new read.`)));
      if (notRead.length) kids.push(el('details', { class: 'stack' }, el('summary', { text: `${notRead.length} section${notRead.length > 1 ? 's' : ''} not read: NextHop treats them as not configured and says so in each prediction` }), table(['Section', 'Status', 'Error'], notRead.map(([k, v]) => [v.title || k, STATUS_WORDS[v.status] || v.status, v.error?.message || '—']), { countLabel: ['section', 'sections'] })));
    } else {
      const org = orgOf(nh.cfg);
      const s = nh.cfg.summary || {};
      const notRead = Object.entries(nh.cfg.sections || {}).filter(([, v]) => !['ok', 'empty'].includes(v.status));
      if (nh.cfg.sample) kids.push(el('div', { class: 'callout warn', role: 'status' }, el('strong', { text: 'Sample topology: fictional Contoso, not your tenant' }), p(`Mailbox ${SAMPLE_MAILBOX} (Megan Bowen, Sales). Domains ${org.domains.map(d => d.name).join(', ')}. Every name, address and IP is made up.`)));
      else kids.push(el('div', { class: 'callout', role: 'status' }, el('strong', { text: `Export file: ${nh.fileName}` }), p(`Tenant ${nh.cfg.tenant?.organization || '(not named)'}; mailbox ${org.mailbox.primary}; exported ${String(nh.cfg.generatedAt || '').slice(0, 16).replace('T', ' ')} UTC by ${nh.cfg.tenant?.signedInAs || 'unknown'}. ${s.ok ?? '?'} sections read with settings, ${s.empty ?? '?'} read and empty, ${notRead.length} not read.`)));
      if (notRead.length) kids.push(el('details', { class: 'stack' }, el('summary', { text: `${notRead.length} section${notRead.length > 1 ? 's' : ''} not read: NextHop treats them as not configured and says so in each prediction` }), table(['Section', 'Status', 'Error'], notRead.map(([k, v]) => [v.title || k, STATUS_WORDS[v.status] || v.status, v.error?.message || '—']), { countLabel: ['section', 'sections'] })));
    }
    if (session.signedIn) kids.push(livePanel());
    else kids.push(note('Sign in (top right) to read your live tenant directly, without an export file.'));
    const row = el('div', { class: 'row' }, openSample, openFile, fileInput);
    if (nh.cfg?.sample) {
      const save = el('button', { class: 'btn', type: 'button', text: 'Download the sample as an export file (.json)' });
      save.addEventListener('click', () => { download(el, 'contoso-sample-mailflow-config.json', JSON.stringify(sampleExport(), null, 2), 'application/json'); flash(save, 'Downloaded'); });
      row.append(save);
    }
    if (nh.cfg) {
      const close = el('button', { class: 'btn', type: 'button', text: nh.cfg.sample ? 'Close the sample' : nh.cfg.live ? 'Close the live read' : 'Close the file' });
      close.addEventListener('click', () => busy(close, 'Closing…', async () => { await pause(); Object.assign(nh, { cfg: null, label: '', fileName: '', result: null }); saveState(); draw(); }));
      row.append(close);
    }
    kids.push(row, status);
    kids.push(el('details', { class: 'stack' }, el('summary', { text: 'How to export your tenant' }),
      p('In PowerShell 7 on your PC, from the Exchange 360 folder. You sign in with MFA; every command is a Get- read and the script refuses to run anything else. The file is saved under $HOME\\Ex360-exports. Then choose "Open an export file (.json)" here.'),
      el('pre', { class: 'report-pre', text: EXPORT_COMMAND }),
      note('The file holds tenant settings and addresses (private, not secret). Keep it on your PC. Its format is documented in docs/mailflow-export.md.')));
    return panel(...kids);
  }

  function load(cfg, label, fileName, { announce = false } = {}) {
    Object.assign(nh, { cfg, label, fileName, result: null, notice: null, wantLive: false });
    if (!nh.input) nh.input = blankInput();
    if (announce) {
      const org = orgOf(cfg);
      const s = cfg.summary || {};
      const notRead = Object.values(cfg.sections || {}).filter(v => !['ok', 'empty'].includes(v.status)).length;
      const what = cfg.sample ? 'Opened the Contoso sample topology' : cfg.live ? `Loaded the live read of ${cfg.tenant?.organization || 'your tenant'}` : `Opened ${fileName}`;
      nh.notice = {
        title: `${what} at ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`,
        text: `NextHop now predicts from ${cfg.sample ? 'the fictional Contoso tenant' : cfg.tenant?.organization || 'this tenant'}, mailbox ${org.mailbox.primary}: ${s.ok ?? '?'} sections with settings, ${s.empty ?? '?'} empty, ${notRead} not read. The Test message pane is open below: fill it in and click Predict mail flow.`,
      };
    }
    saveState();
    draw();
    if (announce) openTestMessage();
  }
  // Panes start collapsed (app.js foldPane). After opening a configuration, expand Test message and bring it into view.
  function unfold(pane) { if (pane?.classList.contains('folded')) pane.querySelector('.pane-fold')?.click(); }
  function openTestMessage() {
    const pane = formRef?.closest('.panel');
    if (!pane) return;
    unfold(pane);
    pane.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------------------------------------------------------------- Live read
  function livePanel() {
    const upn = session.account?.username || '';
    const mailbox = el('input', { id: 'nh-live-mailbox', type: 'text', value: wanted || live.status?.mailbox || upn, autocomplete: 'off', spellcheck: 'false', placeholder: upn || 'someone@yourdomain.com' });
    const start = el('button', { class: 'btn primary', type: 'button', text: nh.cfg?.live ? 'Read the live tenant again' : 'Read my live tenant (no export file)' });
    const progress = el('div', { class: 'stack nh-live-progress', role: 'status', 'aria-live': 'polite' });
    const box = el('div', { class: 'nh-live stack' },
      el('div', { class: 'form-rows' },
        el('div', { class: 'form-row' },
          el('label', { class: 'form-label', for: 'nh-live-mailbox' }, el('span', {}, el('span', { text: 'Mailbox to read' }), ' ', el('span', { class: 'form-need', text: '(required)' })), el('span', { class: 'form-hint', text: 'Its inbox rules, forwarding, junk settings and holds' })),
          el('div', { class: 'form-control' }, mailbox))),
      el('div', { class: 'row' }, start),
      progress);
    const show = status => {
      if (!progress.isConnected && !box.isConnected) return;
      const st = status || {};
      start.disabled = st.state === 'running';
      if (st.state === 'running') {
        const total = st.total || 0;
        const bar = el('progress', { max: String(total || 1), value: String(Math.min(st.sections || 0, total || 1)) });
        progress.replaceChildren(
          el('strong', { text: `Reading ${st.mailbox} from the live tenant: ${st.sections || 0}${total ? ` of ${total}` : ''} sections` }),
          bar,
          p(st.step || 'Starting…', 'muted'),
          note('This takes a minute or two. You can leave this page and keep working: Exchange 360 shows a bubble when it is done.'));
      } else if (st.state === 'error') {
        progress.replaceChildren(el('div', { class: 'not-authorized', role: 'alert' }, el('strong', { text: 'The live read failed' }), p(st.message || 'No detail was returned.')));
      } else if (st.state === 'done' && !nh.cfg?.live) {
        const kids = [p(`Live read finished ${String(st.finishedAt || '').slice(11, 16)} UTC: ${st.message}`, 'muted')];
        if (nh.cfg) {
          const use = el('button', { class: 'btn', type: 'button', text: 'Use the live read instead' });
          use.addEventListener('click', () => busy(use, 'Loading…', async () => { await loadLive(st, true); }));
          kids.push(el('div', { class: 'row' }, use));
        }
        progress.replaceChildren(...kids);
      } else progress.replaceChildren();
    };
    live.onPage = async status => {
      show(status);
      // When a read finishes while NextHop is open, load it straight away.
      // It never replaces an export file or the sample you opened yourself: the Configuration pane offers it instead.
      const opened = nh.cfg && !nh.cfg.live && !nh.wantLive;
      if (!opened && status?.state === 'done' && status.finishedAt !== nh.liveFinishedAt && root.isConnected && (!wanted || String(status.mailbox || '').toLowerCase() === wanted)) await loadLive(status, Boolean(nh.wantLive));
    };
    start.addEventListener('click', () => busy(start, 'Starting…', async () => {
      const typed = mailbox.value.trim();
      if (typed && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(typed)) { show({ state: 'error', message: 'The mailbox must be an email address, for example ' + (upn || 'someone@yourdomain.com') + '.' }); return; }
      // Ask once, on this click, so the finished read can raise a Windows notification while you are elsewhere.
      if ('Notification' in window && Notification.permission === 'default') { try { await Notification.requestPermission(); } catch { /* ignored */ } }
      nh.wantLive = true;
      show(await startLive(typed));
    }));
    show(live.status);
    return box;
  }

  async function loadLive(status, announce = false) {
    const data = await getLive('?config=1');
    if (data?.state !== 'done' || !data.config) return;
    const cfg = data.config;
    cfg.live = true;
    cfg.sample = false;
    nh.liveFinishedAt = status.finishedAt;
    load(cfg, `live read of ${cfg.tenant?.organization || cfg.tenant?.defaultDomain || 'your tenant'}`, '', { announce });
  }

  // ---------------------------------------------------------------- Topology at a glance
  function topologyPanel() {
    const rows = topologyRows(nh.cfg);
    const dir = nh.topoDir || (nh.result?.direction === 'outbound' ? 'outbound' : 'inbound');
    const stages = topologyStages(nh.cfg, dir);
    // Drawn like the Message path: one numbered stop per stage, joined by a line, on the inbound or the outbound path.
    // One box per area at every stop, empty or not; the number of objects is on the front of the box and every object
    // is listed inside it, each opening its own portal. Only the mailbox's own boxes change with the mailbox.
    const areaDetails = r => {
      const kids = [];
      kids.push(el('div', { class: 'row mp-tags' },
        el('span', { class: `mp-pill ${r.status === 'ok' ? 'ok' : r.status === 'empty' ? '' : 'warn'}`, text: STATUS_WORDS[r.status] || r.status }),
        el('span', { class: 'mp-pill info', text: `${r.count} ${r.count === 1 ? 'object' : 'objects'}` }),
        el('span', { class: `mp-pill ${r.predicted ? 'ok' : 'warn'}`, text: r.predicted ? 'Used in predictions' : 'Not predicted yet: shown only' })));
      if (r.objects.length) {
        kids.push(el('h3', { text: 'Objects' }));
        kids.push(el('ul', { class: 'tg-name-list' }, ...r.objects.map(o => el('li', {}, r.kind ? portalAnchor(o.name, r.kind, { ...o }) : o.name))));
      } else kids.push(note('Nothing configured in this area.'));
      kids.push(el('h3', { text: 'Where it is stored, shown and changed' }));
      if (r.kind) {
        kids.push(note('The first button, marked Home, is the portal of the service that stores this kind of object. Every portal page shows some of its settings, not all of them.'));
        kids.push(portalBlock(el, r.kind, {}, { command: false }).node);
      }
      const cmd = nh.cfg?.sections?.[r.key]?.command;
      if (cmd) kids.push(el('div', { class: 'ps-block' }, el('span', { class: 'ps-label', text: 'Every setting, read by the export (Exchange Online or Security & Compliance PowerShell):' }), el('pre', { class: 'report-pre ps-pre', text: `${cmd} | Format-List *` })));
      openDetails(r.title, ...kids);
    };
    // Each box folds: its front (count, title, flag) always shows; select it to list every object. Collapsed
    // by default. Boxes you open stay open while you stay on NextHop.
    const opened = nh.openBoxes || (nh.openBoxes = new Set());
    const box = r => {
      const state = r.status === 'ok' || r.status === 'empty' ? '' : ` · ${STATUS_WORDS[r.status] || r.status}`;
      const objects = `${r.count} ${r.count === 1 ? 'object' : 'objects'}`;
      const head = el('button', { class: 'tg-head', type: 'button', 'aria-expanded': 'false' },
        el('span', { class: 'tg-chev', 'aria-hidden': 'true' }),
        el('span', { class: `tg-count${r.count ? '' : ' zero'}`, text: String(r.count) }),
        el('span', { class: 'tg-title', text: r.title }));
      const items = r.objects.length
        ? el('ul', { class: 'tg-items' }, ...r.objects.map(o => el('li', {}, r.kind ? portalAnchor(o.name, r.kind, { ...o }) : el('span', { text: o.name }))))
        : el('p', { class: 'tg-none', text: r.status === 'ok' || r.status === 'empty' ? 'None configured' : `Not read${state}` });
      const more = el('button', { class: 'btn sm', type: 'button', text: 'Portals and PowerShell' });
      more.addEventListener('click', () => { areaDetails(r); flash(more, 'Opened'); });
      const body = el('div', { class: 'tg-body' }, items, el('div', { class: 'row' }, more));
      const node = el('div', { class: `tg-box${r.count ? '' : ' empty'}${r.predicted ? '' : ' shown-only'}` }, head,
        r.predicted ? '' : el('span', { class: 'mp-flag warn tg-flag', text: 'Not predicted yet' }), body);
      const set = open => {
        node.classList.toggle('folded', !open);
        head.setAttribute('aria-expanded', String(open));
        head.title = `${open ? 'Hide' : 'Show'} the ${objects} in ${r.title}`;
        head.setAttribute('aria-label', `${r.title}: ${objects}. ${open ? 'Hide' : 'Show'} them`);
      };
      head.addEventListener('click', () => {
        const open = node.classList.contains('folded');
        if (open) opened.add(r.key); else opened.delete(r.key);
        set(open);
      });
      set(opened.has(r.key));
      return node;
    };
    const allKeys = stages.flatMap(st => st.rows.map(r => r.key));
    const allOpen = allKeys.length && allKeys.every(k => opened.has(k));
    const toggleAll = el('button', { class: 'btn', type: 'button', text: allOpen ? 'Collapse all boxes' : 'Expand all boxes' });
    toggleAll.addEventListener('click', () => busy(toggleAll, allOpen ? 'Collapsing…' : 'Expanding…', async () => {
      for (const k of allKeys) { if (allOpen) opened.delete(k); else opened.add(k); }
      await pause(); draw();
    }));
    const dirButtons = ['inbound', 'outbound'].map(d => {
      const b = el('button', { class: dir === d ? 'btn primary' : 'btn', type: 'button', 'aria-pressed': String(dir === d), text: d === 'inbound' ? 'Inbound' : 'Outbound' });
      b.addEventListener('click', () => busy(b, 'Drawing…', async () => { nh.topoDir = d; await pause(); draw(); }));
      return b;
    });
    const cols = el('ol', { class: `mp-rail tg-rail ${dir}` }, ...stages.map((st, i) => el('li', { class: `mp-stop tg-stop tg-${st.id}` },
      el('span', { class: 'mp-dot', 'aria-hidden': 'true', text: String(i + 1) }),
      el('span', { class: 'mp-title', text: st.title }),
      ...st.rows.map(box))));
    return panel(h2('Topology at a glance'),
      p(`Every area of this configuration that can change how a message is routed or delivered, on the ${dir} path, stop by stop in the order a message travels. Each box is one area: the number on its front is how many objects it holds, and every object is listed inside it and opens in its portal. A box stays even when it is empty. Every box starts collapsed: select its front to list its objects, then Portals and PowerShell for where it is stored and changed. "Not predicted yet" means NextHop shows the area but does not use it in predictions yet.`, 'muted'),
      el('div', { class: 'row' }, ...dirButtons, toggleAll),
      el('div', { class: 'mp-scroll' }, cols),
      el('div', { class: 'callout' }, el('strong', { text: 'Not in this configuration, so not shown or predicted' }), el('ul', {}, ...TOPOLOGY_OUTSIDE.map(t => el('li', { text: t })))),
      el('details', { class: 'stack' }, el('summary', { text: `Show all ${rows.length} areas as a table` }),
        table(['Area', 'Items', 'Status', 'Used in predictions', 'Names'], rows.map(r => [areaLink(r), { show: String(r.count), text: String(r.count), sort: r.count }, STATUS_WORDS[r.status] || r.status, r.predicted ? 'Yes' : 'Not yet: shown only', namesCell(r)]), { countLabel: ['area', 'areas'] })));
  }
  // Every name in the table opens that object in its portal, or the portal page that lists that kind of object.
  function portalAnchor(text, kind, obj) {
    const { links } = portalLinks(kind, obj);
    const first = links.find(l => l.direct) || links[0];
    return first ? el('a', { class: `obj-link plain${first.direct ? '' : ' find'}`, href: first.url, target: '_blank', rel: 'noopener noreferrer', title: linkTitle(first, text), text }) : el('span', { text });
  }
  function areaLink(r) {
    return r.kind ? { show: portalAnchor(r.title, r.kind, {}), text: r.title, sort: r.title } : r.title;
  }
  function namesCell(r) {
    const shown = r.objects.slice(0, 6);
    if (!shown.length) return '—';
    const wrap = el('span', { class: 'obj-list' });
    shown.forEach((o, i) => { if (i) wrap.append(', '); wrap.append(r.kind ? portalAnchor(o.name, r.kind, { ...o, ...(r.kind === 'group' ? { type: o.type } : {}) }) : o.name); });
    if (r.objects.length > 6) wrap.append(`, and ${r.objects.length - 6} more`);
    const text = r.names.join(', ');
    return { show: wrap, text, sort: text };
  }

  // ---------------------------------------------------------------- Examples
  function examplesPanel(form) {
    const rows = SCENARIOS.map(sc => ({ sc, result: predict(nh.cfg, sc.input) }));
    return panel(h2('Examples'),
      p(nh.cfg.sample ? 'Ready-made test messages, each showing one part of mail flow or governance in the Contoso sample. The outcome column is predicted now. Select a row to load it into the test message and see every step.' : 'Ready-made test messages written for the Contoso sample. Against your export they run with your own settings, so outcomes differ. Select a row to load it.', 'muted'),
      table(['Example', 'What it shows', 'Predicted outcome'], rows.map(({ sc, result }) => [sc.title, sc.shows, { show: el('span', {}, el('span', { class: `report-tag ${TONE_TAG[result.tone]?.[0] || 'info'}`, text: TONE_TAG[result.tone]?.[1] || 'INFO' }), ` ${result.outcome}`), text: result.outcome }]), {
        onRowClick: i => { nh.input = { ...blankInput(), ...rows[i].sc.input }; form.fill(nh.input); form.run(); },
        rowLabel: i => `Load the example "${rows[i].sc.title}"`,
        countLabel: ['example', 'examples'],
      }));
  }

  // ---------------------------------------------------------------- Test message
  function messagePanel() {
    const org = orgOf(nh.cfg);
    const v = nh.input || (nh.input = blankInput());
    // One row per field: the label with (required) or (optional) beside it, an optional muted hint under it, and the
    // control to its right. Labels and controls line up in two columns (styles.css .form-rows); narrow screens stack them.
    const need = required => el('span', { class: 'form-need', text: required ? '(required)' : '(optional)' });
    const head = (name, label, required, hint) => el('label', { class: 'form-label', for: `nh-${name}` },
      el('span', {}, el('span', { text: label }), ' ', need(required)),
      hint ? el('span', { class: 'form-hint', text: hint }) : '');
    const fieldRow = (name, label, required, hint, control) => el('div', { class: 'form-row', 'data-field': name }, head(name, label, required, hint), el('div', { class: 'form-control' }, control));
    const field = (name, label, required, hint, attrs = {}) => fieldRow(name, label, required, hint, el('input', { id: `nh-${name}`, name, type: 'text', autocomplete: 'off', spellcheck: 'false', ...(required && !attrs.readonly ? { required: 'required' } : {}), ...attrs }));
    const select = (name, label, required, hint, options) => fieldRow(name, label, required, hint, el('select', { id: `nh-${name}`, name }, ...options.map(([val, text]) => el('option', { value: val, text }))));
    const labels = items(nh.cfg, 'sensitivityLabels').map(l => [l.DisplayName || l.Name, l.DisplayName || l.Name]);
    const form = el('form', { class: 'stack' },
      el('div', { class: 'form-rows' },
        select('direction', 'Direction', true, '', [['inbound', 'Inbound: outside to the mailbox'], ['outbound', 'Outbound: the mailbox to outside']]),
        field('mailbox', 'Mailbox', true, 'From the configuration', { value: org.mailbox.primary, readonly: 'readonly' }),
        field('externalAddress', 'Outside address', true, 'Made up; nothing is sent', { placeholder: 'someone@outside.example' }),
        el('div', { class: 'form-group', 'data-only': 'inbound' },
          field('fromName', 'From display name', false, 'What the recipient sees as the sender', { placeholder: 'Contoso Billing' }),
          field('ip', 'Sending IP', false, 'Mocked, IPv4', { placeholder: '198.51.100.20' }),
          select('auth', 'Sender authentication', true, 'Mocked', Object.entries(AUTH_RESULTS)),
          select('verdict', 'Spam filter verdict', true, 'Mocked', Object.entries(VERDICTS)),
          field('bcl', 'Bulk complaint level', false, 'Mocked, 0 to 9', { type: 'number', min: '0', max: '9', placeholder: '0' }),
          fieldRow('malware', 'Attachment is malware', false, 'Mocked', el('label', { class: 'row form-check' }, el('input', { id: 'nh-malware', type: 'checkbox', name: 'malware' }), el('span', { text: 'An attachment is malware' })))),
        el('div', { class: 'form-group', 'data-only': 'outbound' },
          select('label', 'Sensitivity label', false, 'The label the sender applies', [['', 'None'], ...labels])),
        select('kind', 'Message type', true, '', Object.entries(MESSAGE_KINDS)),
        field('subject', 'Subject', false, 'Words that rules and DLP look for', { placeholder: 'Invoice 4471 overdue' }),
        field('attachments', 'Attachments', false, 'Name and size, comma between', { placeholder: 'invoice.pdf (300 KB), setup.exe (2 MB)' }),
        fieldRow('body', 'Body', false, 'Anything that should trip a rule', el('textarea', { id: 'nh-body', name: 'body', rows: '4', placeholder: 'Phrases, card numbers, links' }))),
      el('div', { class: 'row' }, el('button', { class: 'btn primary', type: 'submit', text: 'Predict mail flow' })),
      note('Nothing is sent. The outside address is fake, so NextHop does no DNS lookups: the sender\'s authentication, the spam verdict and the IP are the values you choose. Everything else comes from the configuration.'));
    const showFor = () => { const dir = form.elements.direction.value; for (const block of form.querySelectorAll('[data-only]')) block.hidden = block.dataset.only !== dir; };
    form.fill = data => {
      for (const [k, val] of Object.entries(data)) {
        const input = form.elements[k];
        if (!input || k === 'mailbox') continue;
        if (input.type === 'checkbox') input.checked = Boolean(val); else input.value = val ?? '';
      }
      showFor();
    };
    form.read = () => {
      const data = {};
      for (const k of Object.keys(blankInput())) { const input = form.elements[k]; if (input) data[k] = input.type === 'checkbox' ? input.checked : String(input.value).trim(); }
      return data;
    };
    form.run = () => busy(form.querySelector('button[type="submit"]'), 'Predicting…', async () => {
      nh.input = form.read();
      await pause();
      nh.result = predict(nh.cfg, nh.input);
      saveState();
      drawResult();
      // Panes start collapsed; the answer to the click must be visible, so expand the lanes and the prediction.
      for (const host of [pathHost, resultHost]) unfold(host.querySelector('.panel'));
      pathHost.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    form.elements.direction.addEventListener('change', showFor);
    form.addEventListener('submit', event => { event.preventDefault(); form.run(); });
    form.fill(v);
    return { node: panel(h2('Test message'), fromMessage(form), form), form };
  }

  // ---------------------------------------------------------------- Fill the test message from a real message
  // Paste a header block (or a whole message), or choose a .eml / .msg file. lib/message-input.js reads the values
  // NextHop needs from the headers, says which header each came from, fills the form and runs the prediction.
  function fromMessage(form) {
    const area = el('textarea', { id: 'nh-raw', rows: '6', spellcheck: 'false', placeholder: 'Received: from ...\nFrom: "Fabrikam Billing" <billing@fabrikam.com>\nTo: megan.bowen@contoso.com\nSubject: ...\nAuthentication-Results: ...\nX-Forefront-Antispam-Report: ...' });
    const file = el('input', { type: 'file', accept: '.eml,.msg,.txt', class: 'visually-hidden', 'aria-label': 'Message file' });
    const choose = el('button', { class: 'btn', type: 'button', text: 'Choose a .eml or .msg file' });
    const go = el('button', { class: 'btn primary', type: 'button', text: 'Fill the form and predict' });
    const out = el('div', { class: 'stack', role: 'status', 'aria-live': 'polite' });
    const show = parsed => {
      const kids = [el('strong', { text: `Filled ${parsed.read.length} field${parsed.read.length === 1 ? '' : 's'} from the message${parsed.messageId ? ` ${parsed.messageId}` : ''}` }),
        table(['Field', 'Value', 'Read from'], parsed.read.map(r => [r.field, r.value, r.from]), { countLabel: ['field', 'fields'] })];
      if (parsed.rulesInHeaders.length) kids.push(p(`When it was delivered, the headers say these mail flow rules ran: ${parsed.rulesInHeaders.join('; ')}. Compare them with the prediction below, which uses today's configuration.`));
      for (const n of parsed.notes) kids.push(note(n));
      kids.push(note('The prediction uses today\'s configuration. If a rule or policy changed since this message was sent, the predicted path can differ from what happened. Trace a message shows what did happen.'));
      out.replaceChildren(el('div', { class: 'callout' }, ...kids));
    };
    choose.addEventListener('click', () => { flash(choose, 'Choose a file'); file.click(); });
    file.addEventListener('change', () => {
      const chosen = file.files?.[0];
      if (!chosen) return;
      busy(choose, 'Reading the file…', async () => {
        try {
          const buf = new Uint8Array(await chosen.arrayBuffer());
          const parsed = parseMessageFile(chosen.name, buf);
          // A .eml keeps its body; a .msg gives the transport headers only.
          const whole = chosen.name.toLowerCase().endsWith('.msg') ? parsed.headers : new TextDecoder().decode(buf);
          area.value = whole.length > 200000 ? whole.slice(0, 200000) : whole;
        } catch (error) { out.replaceChildren(el('div', { class: 'callout warn', text: error.message })); }
      });
      file.value = '';
    });
    go.addEventListener('click', () => busy(go, 'Reading the message…', async () => {
      await pause();
      let parsed;
      try { parsed = inputFromMessage(area.value, nh.cfg); } catch (error) { out.replaceChildren(el('div', { class: 'callout warn', text: error.message })); return; }
      nh.input = { ...blankInput(), ...parsed.input };
      form.fill(nh.input);
      show(parsed);
      form.run();
    }));
    return el('details', { class: 'stack nh-from-message' },
      el('summary', { text: 'Fill it from a real message: paste its headers or choose a .eml file' }),
      p('Copy the headers from Outlook (File > Properties > Internet headers) or from Message trace, or save the message as .eml. Exchange 360 reads the sender, recipients, subject, sending IP, SPF/DKIM/DMARC result and spam verdict from them, fills the form below and predicts its path. The file is read in this browser; nothing is uploaded.', 'muted'),
      area, el('div', { class: 'row' }, go, choose, file), out);
  }

  // ---------------------------------------------------------------- Prediction
  // Under each step, a chip for every admin portal page where that step's setting is changed: a direct link to the
  // object when the portal can open it, otherwise the portal's page for that kind of setting. PowerShell-only settings
  // name the cmdlet instead.
  function stepLinks(step) {
    const kinds = stepPortalKinds(step);
    if (!kinds.length) return '';
    const seen = new Set();
    const links = [];
    const notes = [];
    const commands = [];
    let shell = '';
    for (const kind of kinds) {
      const named = (step.settings || []).find(x => x.kind === kind && x.name);
      const out = portalLinks(kind, { name: named?.name || '' });
      for (const l of out.links) {
        if (seen.has(l.url)) continue;
        seen.add(l.url);
        links.push({ ...l, label: named?.name || '' });
      }
      if (named && out.command?.lines?.length) {
        for (const line of out.command.lines) if (!commands.includes(line)) commands.push(line);
        shell = shell && shell !== out.command.shell ? 'the PowerShell named in each line (Exchange Online or Security & Compliance)' : out.command.shell;
      }
      if (!out.links.length && out.note && !notes.includes(out.note)) notes.push(out.note);
    }
    // Home portals (where each object is stored) first, then the portals that show some of its settings.
    links.sort((x, y) => Number(!!y.home) - Number(!!x.home));
    const chips = links.map(l => el('a', { class: chipClass(l), href: l.url, target: '_blank', rel: 'noopener noreferrer', title: `${linkTitle(l, l.label)}${l.home ? '. This is where the object is stored.' : ''}`, text: chipText(l) }));
    return el('span', { class: 'walk-links' },
      chips.length ? el('span', { class: 'portal-chips' }, el('span', { class: 'walk-links-label', text: 'Some settings shown in' }), ...chips) : '',
      ...notes.map(n => el('span', { class: 'obj-note', text: n })),
      commands.length ? el('span', { class: 'ps-block' }, el('span', { class: 'ps-label', text: `Every setting, in ${shell}:` }), el('pre', { class: 'report-pre ps-pre', text: commands.join('\n') })) : '');
  }

  // The settings behind one step, folded under that step. Every one starts folded (collapsed-by-default rule); the
  // step that stopped or changed the message is already marked red.
  function stepSettings(step) {
    const rows = step.settings || [];
    if (!rows.length) return '';
    const mailboxId = orgOf(nh.cfg).mailbox.raw?.ExternalDirectoryObjectId;
    return el('details', { class: 'walk-settings' },
      el('summary', { text: `Settings that caused it (${rows.length})` }),
      table(['Object', 'Setting', 'Value'], rows.map(x => [objCell(x.name, x.kind, { name: x.name, ...(x.kind === 'mailbox' ? { id: mailboxId, upn: x.name } : {}) }), x.property, x.value || '—']), { countLabel: ['setting', 'settings'] }));
  }

  const resultHost = el('div', { class: 'stack' });
  const pathHost = el('div', { class: 'stack' });
  function drawPath() {
    pathHost.replaceChildren(nh.cfg ? messagePathPanel({ el, panel, h2, p, note, flash, busy }, nh.cfg, nh.result) : '');
  }
  function drawResult() {
    drawPath();
    const r = nh.result;
    if (!r) { resultHost.replaceChildren(); return; }
    const status = el('p', { class: 'muted', role: 'status' });
    const save = el('button', { class: 'btn primary', type: 'button', text: 'Download report (.mhtml)' });
    save.addEventListener('click', () => busy(save, 'Building…', async () => {
      await pause();
      const at = new Date().toISOString();
      const name = nextHopFileName(r, at);
      const text = nextHopMhtml(r, { generatedAt: at, configLabel: nh.fileName ? `${nh.label} (${nh.fileName})` : nh.label });
      download(el, name, text, 'multipart/related');
      status.textContent = `Saved ${name} (${Math.max(1, Math.round(text.length / 1024))} KB) to your Downloads folder. It opens in Edge.`;
    }).then(() => flash(save, 'Downloaded')));
    const copy = el('button', { class: 'btn', type: 'button', text: 'Copy as text' });
    copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(nextHopText(r)); flash(copy, 'Copied'); } catch { flash(copy, 'Copy failed'); }
    });
    const walk = el('ol', { class: 'walk nexthop-walk' }, ...r.steps.map(s => el('li', { class: `walk-step ${s.tone}` },
      el('span', { class: 'walk-n', text: String(s.n) }),
      el('span', {}, el('span', { class: `report-tag ${TONE_TAG[s.tone]?.[0] || 'info'}`, text: TONE_TAG[s.tone]?.[1] || 'INFO' })),
      el('span', { class: 'walk-comp', text: s.component }),
      el('span', { class: 'walk-text' }, el('span', { text: s.text }), stepLinks(s), stepSettings(s)))));
    // Start the next check straight away: change this one (same values) or begin from a blank message.
    const again = el('button', { class: 'btn', type: 'button', text: 'Change this check' });
    again.addEventListener('click', () => { flash(again, 'Form above'); toForm(false); });
    const fresh = el('button', { class: 'btn', type: 'button', text: 'New check' });
    fresh.addEventListener('click', () => { flash(fresh, 'Blank form above'); toForm(true); });
    const tone = { high: 'not-authorized', medium: 'callout warn', ok: 'callout ok', info: 'callout' }[r.tone] || 'callout';
    const kids = [
      h2('Prediction'),
      el('div', { class: tone, role: 'status' }, el('strong', { text: r.outcome }), p(`${r.message.from} to ${r.message.to}. ${r.source === 'sample' ? 'Contoso sample topology (fictional).' : `Configuration: ${nh.label}.`}${r.encrypted && !/encrypted/.test(r.outcome) ? ' The message is encrypted.' : ''}`)),
      el('div', { class: 'row' }, save, copy, again, fresh),
      status,
      el('section', { class: 'walk-box stack' }, el('h3', { text: 'What happens, step by step' }), walk, note('In the order Exchange Online applies them. Green: passed. Blue: information. Amber: worth a look. Red: this stops or changes the message. Open "Settings that caused it" under a step for the exact settings.')),
    ];
    if (r.copies.length) kids.push(el('h3', { text: 'Copies and reports' }), table(['Sent to', 'Why'], r.copies.map(c => [c.to, c.why]), { countLabel: ['copy', 'copies'] }));
    if (r.notes.length) kids.push(el('div', { class: 'callout warn' }, el('strong', { text: 'Also' }), ...r.notes.map(n => p(n))));
    if (r.unknowns.length) kids.push(el('div', { class: 'callout warn' }, el('strong', { text: 'What NextHop could not predict' }), ...r.unknowns.map(u => p(u))));
    resultHost.replaceChildren(panel(...kids));
  }

  let formRef = null;
  function toForm(blank) {
    if (!formRef) return;
    if (blank) { nh.input = blankInput(); formRef.fill(nh.input); saveState(); }
    formRef.closest('.panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const first = formRef.elements[blank ? 'externalAddress' : 'direction'];
    setTimeout(() => { first?.focus(); if (blank) first?.select(); }, 350);
  }

  function draw() {
    const kids = [];
    if (picker) kids.push(picker());
    const na = notApplicable ? notApplicable() : null;
    if (na) kids.push(na);
    else if (wanted && session.signedIn) {
      const using = nh.cfg?.live && String(orgOf(nh.cfg).mailbox.primary || '').toLowerCase() === wanted;
      kids.push(el('div', { class: using ? 'callout ok' : 'callout', role: 'status' }, el('strong', { text: using ? `NextHop is using ${recipient.displayName || wanted} (${wanted})` : `Reading ${recipient.displayName || wanted} (${wanted}) from the live tenant` }),
        p(using ? 'The recipient open in SINGLE RECIPIENT. Predictions use its inbox rules, forwarding, junk settings and holds, read live with your own permissions.' : 'NextHop starts a read-only live read for the recipient open in SINGLE RECIPIENT. It takes a minute or two; the Configuration pane shows progress, and the predictions load when it finishes.')));
    }
    kids.push(configPanel());
    if (nh.cfg) {
      const msg = messagePanel();
      formRef = msg.form;
      kids.push(msg.node, examplesPanel(msg.form), pathHost, resultHost, topologyPanel());
    }
    root.replaceChildren(...kids);
    drawResult();
  }

  draw();
  pageEl.replaceChildren(root);

  // After a refresh: bring back the configuration and form from this browser, then pick up a live read that is still
  // running (with its bubble) or that finished since this page last loaded one.
  (async () => {
    if (!nh.cfg && !nh.restored) {
      nh.restored = true;
      if (await restoreState()) draw();
    }
    if (!session.signedIn) return;
    try { live.status = await getLive(); } catch { return; }
    // A recipient is open in SINGLE RECIPIENT and NextHop does not hold it yet: read it live (read-only), once.
    const have = String(live.status?.mailbox || '').toLowerCase();
    const holding = nh.cfg?.live && String(orgOf(nh.cfg).mailbox.primary || '').toLowerCase() === wanted;
    if (wanted && !holding && live.status?.state !== 'running' && !(live.status?.state === 'done' && have === wanted) && nh.autoStarted !== wanted) {
      nh.autoStarted = wanted;
      try { await startLive(wanted); } catch { /* the Configuration pane shows the error on the next read */ }
      return;
    }
    if (live.status?.state === 'running') {
      if (!live.startedHere) live.startedHere = Date.parse(live.status.startedAt) || Date.now();
      if (!live.timer) watchLive();
    }
    emitLive();
  })();
}
