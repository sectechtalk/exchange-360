import { installShell } from './shell.js';
import { applyTheme, toggleTheme, initialTheme } from './theme.js';
import { viewFromHash, writeView, queryFromHash } from './router.js';
import { PAGES, isPage } from '/lib/pages.js';
import { analyze, explainField } from '/lib/analyzer.js';
import { shareCopy } from '/lib/redact.js';
import { SAMPLES } from '/lib/samples.js';
import { HEADER_EXAMPLES, RULE_SCENARIOS, RULE_HOW_TO, headerExample } from '/lib/learn-examples.js';
import { parseMessageFile } from '/lib/message.js';
import { featureStatus, normalizeSku } from '/lib/licenses.js';
import { portalsFor, fillUser, HEALTH_LINKS, HEALTH_SITES } from '/lib/portals.js';
import { FIRST_MINUTES, PHASES, PATH, SITUATIONS, ASK_THE_TEAM, GLOSSARY, GLOSSARY_CATEGORIES, FEATURE_NEEDS, NEED_KINDS, OR, LEARN, PLAYBOOKS, SIGN_IN_ERRORS, lookupSignInError, ONPREM } from '/lib/content.js';
import { NDR, lookupNdr } from '/lib/ndr.js';
import { dlpForMailbox, retentionForMailbox, holdsForMailbox, caForMailbox, alertsForMailbox } from '/lib/compliance.js';
import { HOPS, hopForPermission, loginPath, remainingHops, connectAllPath } from '/lib/hops.js';
import { reviewTenant, SEVERITY_LABEL } from '/lib/review.js';
import { bookingWords, matchesRecipient } from '/lib/recipients.js';
import { walkText } from '/lib/walkthrough.js';
import { explainStatus, traceVerdict, traceOutcome, detailMismatch, signedOutTrace, traceWalkthroughSteps, traceCommand, detailCommand, relatedCommand, eventTimeline, messageFacts, rulesHit, parseSpam, formatUtc, toTime } from '/lib/trace.js';
import { explainQuarantine, quarantineSummary } from '/lib/quarantine.js';
import { settingsWords } from '/lib/report.js';
import { authPolicyWords } from '/lib/auth-policy.js';
import { CHANGE_RIGHTS, rightsVerdict } from '/lib/change-rights.js';
import { panePortal } from '/lib/pane-portals.js';
import { busy, flash, leaving, installPressFeedback } from './busy.js';
import { dataTable, openDetails } from './grid.js';
import { pageApplies, reportApplies, recipientType, KIND_WORDS } from '/lib/recipient-types.js';
import { userRoleWords, entraExchangeRoles, splitAssignments, assignmentScope, names } from '/lib/roles.js';
import { portalLinks, linkTitle, recipientKind as linkKindFor } from '/lib/object-links.js';
import { RULE_COLUMNS, ruleListRow, describeRule, ruleSettings, ruleWarnings } from '/lib/rules-view.js';
import { renderNextHop } from './nexthop-page.js';

const $ = id => document.getElementById(id);
const pageEl = $('page');
const state = { session: {}, demo: true, org: null, box: null, mailboxId: '', mailboxSource: 'user', analysis: null, signins: null, trace: null, outlook: null, compliance: null, report: null };

const el = (tag, props = {}, ...kids) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v == null ? '' : String(v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v != null) node.setAttribute(k, String(v));
  }
  for (const kid of kids.flat()) if (kid != null) node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return node;
};
// The object in a table row: its name opens the first portal that can open it directly, and under the name one
// link per portal where it can be changed (lib/object-links.js). A portal that cannot open one object directly gets
// a "find it here" link to its page for that kind of object. Nothing links to Graph.
function objCell(label, kind, obj = {}) {
  const text = label == null || label === '' ? '—' : String(label);
  const { links, note: why } = portalLinks(kind, obj);
  const first = links.find(l => l.direct);
  const wrap = el('span', { class: 'obj-cell' });
  wrap.append(first ? el('a', { class: 'obj-link', href: first.url, target: '_blank', rel: 'noopener noreferrer', title: linkTitle(first, text), text }) : el('span', { class: 'obj-name', text }));
  if (links.length) {
    const list = el('span', { class: 'portal-chips' });
    for (const l of links) list.append(el('a', { class: l.direct ? 'portal-chip' : 'portal-chip find', href: l.url, target: '_blank', rel: 'noopener noreferrer', title: linkTitle(l, text), text: l.direct ? l.short : `${l.short}: find it here` }));
    wrap.append(list);
  }
  if (why) wrap.append(el('span', { class: 'obj-note', text: why }));
  return { show: wrap, text, sort: text };
}
const xc = (kind, label) => objCell(label, kind);
const panel = (...kids) => addPanePortal(el('section', { class: 'panel stack' }, ...kids));
// Every pane links to the portal page for what it shows, right under its heading (lib/pane-portals.js).
// Skipped: the loading panel, metric tiles, the "Where this is changed" block, and panes that already
// carry their own portal button.
function paneWithPortal(node, portalId) {
  const item = portalId && portalsFor(portalId);
  const main = item?.links?.[0];
  if (main) node.querySelector(':scope > h2')?.after(el('div', { class: 'row pane-portal' }, el('a', { class: 'btn primary sm', href: main.url, target: '_blank', rel: 'noopener noreferrer', text: `Open in portal: ${main.name}` })));
  return main ? node : addPanePortal(node);
}
function addPanePortal(node) {
  if (node.querySelector('.loading, .metric, a.btn[target="_blank"]')) return node;
  const first = node.firstElementChild;
  if (first?.tagName === 'H3' && /^Where this is changed/.test(first.textContent)) return node;
  const heading = node.querySelector(':scope > h2, :scope > h3, :scope > .spread > h2');
  const item = portalsFor(panePortal(currentView(), heading?.textContent || '', recipientKind()));
  if (!item?.links?.length) return node;
  const [main, ...more] = item.links;
  const bar = el('div', { class: 'row pane-portal' },
    el('a', { class: 'btn primary sm', href: main.url, target: '_blank', rel: 'noopener noreferrer', text: `Open in portal: ${main.name}` }),
    ...more.map(l => el('a', { class: 'btn sm', href: l.url, target: '_blank', rel: 'noopener noreferrer', text: l.name })));
  const anchor = heading?.parentElement === node ? heading : heading?.parentElement?.parentElement === node ? heading.parentElement : null;
  if (anchor) anchor.after(bar); else node.prepend(bar);
  return node;
}
const h2 = text => el('h2', { text });
const p = (text, className) => el('p', { class: className || '', text });
const note = text => p(text, 'muted');

function denied(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (value.authorized === false || value.licensed === false || value.label === 'Not authorized' || value.label === 'License required') return value;
  if (value.ok === false && (value.permission || value.label)) return value;
  return null;
}
function currentView() {
  return viewFromHash(location.hash, isPage) || 'start';
}
function callout(value) {
  const block = el('div', { class: value.authorized === false ? 'not-authorized' : 'callout warn', role: 'status' });
  block.append(el('strong', { text: value.label || (value.authorized === false ? 'Not authorized' : 'Unavailable') }));
  block.append(el('p', { text: value.message || '' }));
  if (value.permission) block.append(el('p', { text: `Permission: ${value.permission}. Role: ${value.role}.` }));
  if (value.consentUrl) {
    block.append(el('p', { text: 'An administrator opens API permissions for this app and chooses Grant admin consent. Then sign in again so the new token includes the permission.' }));
    block.append(el('a', { class: 'btn primary', href: value.consentUrl, target: '_blank', rel: 'noopener noreferrer', text: 'Grant admin consent' }));
  }
  const hop = value.authorized === false ? (hopForPermission(value.permission) || (/Exchange\.Manage/.test(`${value.permission || ''} ${value.message || ''}`) ? HOPS.exchange : null)) : null;
  if (hop && !value.consentUrl) {
    block.append(el('p', { text: `${hop.unlocks} If admin consent is not in place yet, Setup steps shows how to grant it.` }));
    block.append(el('a', { class: 'btn primary', href: loginPath({ resource: hop.resource, returnTo: currentView() }), text: hop.button }));
  } else if (hop) {
    block.append(el('a', { class: 'btn', href: loginPath({ resource: hop.resource, returnTo: currentView() }), text: 'Sign in again after consent' }));
  }
  if (value.detail) {
    const details = el('details');
    details.append(el('summary', { text: 'Details' }));
    details.append(el('pre', { text: value.detail }));
    block.append(details);
  }
  return block;
}
function renderConnections() {
  const host = $('connections');
  if (!host) return;
  const connections = state.session?.connections || {};
  const view = currentView();
  host.replaceChildren();
  const rows = [
    ['graph', 'Graph', connections.graph, 'licenses, domains, and service health'],
    ['exchange', 'Exchange', connections.exchange, HOPS.exchange.unlocks],
    ['purview', 'Purview Graph', connections.purview, HOPS.purview.unlocks],
    ['compliance', 'Compliance PowerShell', connections.compliance, HOPS.compliance.unlocks],
  ];
  for (const [resource, label, on] of rows) {
    const item = el('span', { class: 'connection' });
    item.append(el('span', { class: on ? 'badge live' : 'badge', text: on ? `${label} connected` : `${label} not connected` }));
    if (!on) item.append(el('a', { class: 'btn sm', href: loginPath({ resource, returnTo: view }), text: 'Sign in' }));
    host.append(item);
  }
  if (connections.graph) {
    const next = remainingHops(connections);
    if (next.length) {
      host.append(el('a', {
        class: 'btn primary sm',
        href: connectAllPath(view),
        text: 'Connect everything',
      }));
    }
  }
}
// Every data table in Ex360 goes through here: each column header opens Sort A to Z, Sort Z to A and a search box.
function table(headers, rows, options = {}) {
  return dataTable({ columns: headers, rows, ...options });
}
// details(row) gives [setting, value] pairs: selecting a row opens them in the flyout, the way the portal
// opens an item. Facts that are not portal columns live there.
function showRows(parent, value, headers, mapRow, empty, details) {
  const block = denied(value);
  if (block) { parent.append(callout(block)); return; }
  if (value && typeof value === 'object' && !Array.isArray(value) && value.ok === false) { parent.append(callout({ ...value, authorized: value.authorized !== false })); return; }
  if (!Array.isArray(value) || !value.length) { parent.append(note(empty || 'None in this tenant.')); return; }
  const rows = value.map(mapRow);
  const titleOf = i => { const c = rows[i][0]; return c && typeof c === 'object' ? c.text : String(c ?? ''); };
  parent.append(table(headers, rows, details ? { onRowClick: i => openDetails(titleOf(i), table(['Setting', 'Value'], details(value[i]).map(([k, v]) => [k, v == null || v === '' ? DASH : v]))), rowLabel: i => `Open ${titleOf(i)}` } : {}));
}
function portals(id, powershell = '') {
  const item = portalsFor(id);
  if (!item) return el('p', { text: '' });
  const list = el('ul', { class: 'portal-list' });
  item.links.forEach((link, i) => list.append(el('li', {}, el('a', { href: link.url, target: '_blank', rel: 'noopener noreferrer', text: `${i === 0 ? 'Open' : 'Also'}: ${link.name}` }))));
  const command = powershell || fillUser(item.powershell, currentView().startsWith('mb-') ? mb()?.primary : '');
  const view = currentView();
  const role = CHANGE_RIGHTS[view] ? rightsLine(view) : p('Ex360 only reads. The portal checks your role before it lets you change anything.');
  // Collapsed until opened, on every page: the heading stays visible and a click shows the rest.
  return el('details', { class: 'panel stack where-changed' }, el('summary', {}, el('h3', { text: `Where this is changed: ${item.title}` })), role, list, el('pre', { text: command }));
}
// Single recipient pages: whether the signed-in person's Exchange role includes the change the portal link makes.
function rightsLine(view) {
  const holder = el('div', { class: 'stack' }, note('Checking your Exchange role…'));
  shared(`/api/rights${demoQuery()}`).then(data => {
    if (data?.ok === false || !Array.isArray(data?.value)) { holder.replaceChildren(callout(denied(data) || { label: data?.label || 'Could not check your role', message: data?.message || 'Ex360 could not read which Exchange cmdlets your role includes.', authorized: true })); return; }
    const v = rightsVerdict(view, data.value);
    const tag = { yes: ['ok', 'ALLOWED'], partly: ['medium', 'PARTLY'], no: ['high', 'NOT AUTHORIZED'] }[v.verdict];
    holder.replaceChildren(
      el('p', {}, el('span', { class: `report-tag ${tag[0]}`, text: tag[1] }), ` ${v.words}${data.source === 'demo' ? ' (demo data)' : ''}`),
      table(['Change cmdlet', 'Your role'], v.lines.map(l => [l.label, l.ok ? 'Yes' : `No: ${l.why}`])),
      note('Ex360 asks Exchange Online which cmdlets and parameters your role includes (Get-Command after sign-in). Nothing is run. A management scope can still limit which recipients you can change; Role assignments and scopes lists them.'));
  }).catch(error => { if (error !== STALE) holder.replaceChildren(callout({ label: 'Could not check your role', message: String(error?.message || error), authorized: true })); });
  return holder;
}
// Page changes must never wait on, or be overwritten by, a read started for another page.
// Each render() gets a number. A read that finishes after the person has moved on throws STALE, so the old
// page's code stops there instead of drawing over the new page. Shared reads (org, recipient, compliance,
// recipients) are kept for the whole visit, so going back to a page shows it at once.
const STALE = Symbol('stale render');
let renderSeq = 0;
async function rawGet(path) {
  const res = await fetch(path, { headers: { accept: 'application/json' } });
  return res.json();
}
async function stillCurrent(promise) {
  const seq = renderSeq;
  const value = await promise;
  if (seq !== renderSeq) throw STALE;
  return value;
}
function get(path) { return stillCurrent(rawGet(path)); }
const sharedReads = new Map();
function shared(path) {
  if (!sharedReads.has(path)) sharedReads.set(path, rawGet(path).catch(error => { sharedReads.delete(path); throw error; }));
  return stillCurrent(sharedReads.get(path));
}
function forgetReads() {
  sharedReads.clear();
  Object.assign(state, { org: null, box: null, boxError: null, trace: null, signins: null, compliance: null, report: null, recipients: null });
}
function loadingPanel(id) {
  const page = PAGES.find(item => item.id === id);
  return panel(el('p', { class: 'loading', role: 'status', text: `Loading ${page?.title || 'this page'}…` }), note(state.demo ? 'Reading the Contoso demo data.' : 'Reading your tenant as you. The first visit to a page can take a few seconds; later visits are instant until you choose Read again.'));
}
function demoQuery() { return state.demo ? '?demo=1' : ''; }
// For a URL that already has a ? query. demoQuery() there made "?q=mark?demo=1", so demo searches never matched.
function demoAnd() { return state.demo ? '&demo=1' : ''; }

function setTitle(id) {
  const page = PAGES.find(item => item.id === id);
  $('page-title').textContent = page?.title || 'Exchange 360';
  $('page-intro').textContent = page?.blurb || '';
  for (const link of document.querySelectorAll('#navigation a[data-view]')) {
    const on = link.dataset.view === id;
    link.classList.toggle('active', on);
    if (on) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  }
}

function steps(items) {
  return el('ol', { class: 'steps' }, ...items.map(text => el('li', { text })));
}

const SETUP_STATUS = {
  pass: { text: 'Pass', cls: 'ok' },
  fail: { text: 'Fix this', cls: 'crit' },
  todo: { text: 'To do', cls: 'warn' },
  warn: { text: 'Could not check', cls: 'warn' },
  wait: { text: 'Waiting', cls: 'muted' },
  optional: { text: 'Optional', cls: 'muted' },
};
function setupRow(item) {
  const status = SETUP_STATUS[item.status] || SETUP_STATUS.wait;
  const card = el('article', { class: `setup-row ${status.cls}`, id: `check-${item.id}` });
  card.append(el('div', { class: 'setup-head' }, el('span', { class: `setup-pill ${status.cls}`, text: status.text }), el('strong', { text: item.title })));
  card.append(p(item.summary));
  if (item.fix) {
    const fix = el('div', { class: 'setup-fix' });
    fix.append(el('p', {}, el('strong', { text: 'How to fix. ' }), `Who: ${item.fix.who}.`));
    fix.append(steps(item.fix.steps));
    if (item.fix.link) fix.append(el('a', { class: 'btn primary', href: item.fix.link.url, target: '_blank', rel: 'noopener noreferrer', text: item.fix.link.label }));
    card.append(fix);
  }
  if (item.action) card.append(el('a', { class: item.fix?.link ? 'btn' : 'btn primary', href: item.action.href, text: item.action.label }));
  if (item.detail) {
    const details = el('details');
    details.append(el('summary', { text: 'Details' }), el('pre', { text: item.detail }));
    card.append(details);
  }
  return card;
}
function recordTable(record) {
  return table(['Setting', 'Value', 'Where'], record.map(r => {
    const where = /^https?:\/\//.test(r.where)
      ? { show: el('a', { href: r.where, target: r.where.startsWith('http://localhost') ? null : '_blank', rel: 'noopener noreferrer', text: r.where.includes('entra.microsoft.com') ? 'Open in Entra' : r.where }), text: r.where }
      : r.where;
    return [r.item, r.value, where];
  }));
}
async function renderSetup() {
  const root = el('div', { class: 'stack' });
  const top = panel(h2('Is everything in place?'), p('Ex360 checks each setting with your own sign-in. It only reads. It never changes the app registration, consent, or your roles; each fix below is a step you take yourself in Entra.'));
  const runButton = el('button', { type: 'button', class: 'btn primary', text: 'Run every check (about 20 seconds)' });
  const status = el('p', { class: 'muted', role: 'status', text: 'Showing the quick checks. Run every check also connects to Exchange Online PowerShell for real.' });
  top.append(el('div', { class: 'row' }, runButton), status);
  root.append(top);
  const body = el('div', { class: 'stack' });
  root.append(body);
  pageEl.replaceChildren(root);
  const draw = data => {
    body.replaceChildren();
    const s = data.summary;
    body.append(el('div', { class: `callout ${s.ready ? 'ok' : s.fail ? 'crit' : 'warn'}`, role: 'status' },
      el('strong', { text: s.ready ? 'Everything Ex360 needs is in place.' : `${s.pass} of ${s.total} required checks pass.` }),
      el('p', { text: s.ready ? 'Live pages use your tenant. Optional rows only matter for the pages they name.' : `${s.fail} ${s.fail === 1 ? 'needs' : 'need'} a fix and ${s.waiting} ${s.waiting === 1 ? 'is' : 'are'} waiting on an earlier step. Work from the top down; later checks depend on earlier ones.` }),
      el('p', { class: 'muted', text: `Checked ${new Date(data.checkedAt).toLocaleString()}.` })));
    const groups = [];
    for (const item of data.rows) {
      let g = groups.find(x => x.name === item.group);
      if (!g) { g = { name: item.group, rows: [] }; groups.push(g); }
      g.rows.push(item);
    }
    for (const g of groups) body.append(panel(h2(g.name), ...g.rows.map(setupRow)));
    body.append(panel(
      h2('The one-off configuration, written down'),
      p('This is the full list of settings Ex360 depends on. It is kept in the app, in docs/setup.md and in docs/auth.md, so nothing lives only in someone\'s memory.'),
      recordTable(data.record),
    ));
  };
  const load = async live => busy(runButton, live ? 'Running every check…' : 'Running the quick checks…', async () => {
    status.textContent = live ? 'Running every check, including a real Exchange Online PowerShell connection...' : 'Running the quick checks...';
    try {
      const data = await get(`/api/setup${live ? '?live=1' : ''}`);
      draw(data);
      status.textContent = live ? 'Every check ran, including Exchange Online PowerShell.' : 'Showing the quick checks. Run every check also connects to Exchange Online PowerShell for real.';
    } catch (error) {
      status.textContent = `The checks could not run: ${error.message}. Is the container running?`;
    }
  });
  runButton.addEventListener('click', () => load(true));
  await load(false);
}
function renderStart() {
  const done = new Set(JSON.parse(localStorage.getItem('ex360-path') || '[]'));
  const root = el('div', { class: 'stack' });
  root.append(panel(
    h2('Just been told you own Exchange Online?'),
    p('Exchange Online holds the mailboxes. Exchange Online Protection is the filter in front of them. Defender for Office 365, if the tenant has it, adds Safe Links, Safe Attachments and impersonation checks. Ex360 reads all of that with your own sign-in and does not change it.'),
    p('Pages that read your tenant ask you to sign in first. Ex360 reads with your own permissions.'),
  ));
  root.append(panel(h2('The first 15 minutes'), el('ol', { class: 'steps' }, ...FIRST_MINUTES.map(step => el('li', {}, el('a', { href: `#${step.open.view}`, text: step.title }), ` — ${step.how}`)))));
  const path = panel(h2('The first three weeks'));
  for (const phase of PHASES) {
    path.append(el('h3', { text: `${phase.title}. ${phase.sub}` }));
    for (const step of PATH.filter(s => s.phase === phase.id)) {
      const box = el('label', { class: 'row' }, el('input', { type: 'checkbox' }));
      box.querySelector('input').checked = done.has(step.id);
      box.querySelector('input').addEventListener('change', () => {
        if (box.querySelector('input').checked) done.add(step.id); else done.delete(step.id);
        localStorage.setItem('ex360-path', JSON.stringify([...done]));
      });
      box.append(el('span', { text: `${step.title} (${step.minutes}). ${step.why}` }), el('a', { href: `#${step.open.view}`, text: step.open.label }));
      path.append(box);
    }
  }
  root.append(path);
  root.append(panel(h2('Questions to ask your team'), el('ul', { class: 'plain' }, ...ASK_THE_TEAM.map(q => el('li', { text: q })))));
  pageEl.replaceChildren(root);
}

// Layout: one entry per line, grouped under "Permissions:", "Role:" and so on, with OR on its
// own line between alternatives, all inside the feature's row.
const needName = item => (typeof item === 'string' ? item : item.name);
function needEntry(item) {
  return el('li', { class: 'need-entry' }, el('span', { text: needName(item) }), item.note ? el('span', { class: 'need-note muted', text: ` (${item.note})` }) : null);
}
function needCell(parts) {
  const box = el('div', { class: 'need-cell' });
  const words = [];
  let loose = null; // plain license lines in the tenant column
  for (const part of parts) {
    if (part === OR) { loose = null; box.append(el('div', { class: 'need-or', text: 'OR' })); words.push('OR'); continue; }
    if (typeof part === 'string' || !part.items) {
      if (!loose) { loose = el('ul', { class: 'need-items' }); box.append(loose); }
      loose.append(needEntry(part)); words.push(needName(part));
      continue;
    }
    loose = null;
    box.append(el('div', { class: 'need-group' },
      el('div', { class: 'need-head', title: NEED_KINDS[part.kind] || '', text: `${part.kind}:` }),
      el('ul', { class: 'need-items' }, ...part.items.map(needEntry))));
    words.push(`${part.kind}: ${part.items.map(needName).join(', ')}`);
  }
  return { show: box, text: words.join(' '), sort: words.filter(w => w !== 'OR').join(', ') };
}
function renderNeeds() {
  pageEl.replaceChildren(panel(
    h2('What decides whether a page has rows'),
    p('The tenant needs the right license, because some data only exists with Defender for Office 365 or Entra ID P1. Your account needs what the right-hand column lists, because Ex360 reads with your sign-in and nothing else. Permissions are consented once on the Ex360 app registration, and Setup steps checks them. A page you cannot read says Not authorized and names what is missing. It does not show an empty table.'),
    el('dl', { class: 'need-legend' }, ...Object.entries(NEED_KINDS).flatMap(([kind, words]) => [el('dt', { text: `${kind}:` }), el('dd', { class: 'muted', text: words })])),
    p('OR on its own line means any one of the groups is enough. Groups with no OR between them are all needed.'),
    table(['Feature', 'The tenant needs', 'Your account needs'], FEATURE_NEEDS.map(row => [
      { show: el('span', { class: 'need-feature' }, el('span', { text: row.feature }), el('a', { class: 'need-learn', href: row.learn, target: '_blank', rel: 'noopener noreferrer', text: 'Microsoft Learn article' })), text: row.feature, sort: row.feature },
      needCell(row.tenant),
      needCell(row.you),
    ]), { search: true, searchLabel: 'Search features, licenses, roles and permissions', countLabel: ['feature', 'features'] }),
    note('Each feature links to the Microsoft Learn article it was checked against.'),
  ));
}

function renderAsked() {
  pageEl.replaceChildren(el('div', { class: 'grid grid-2' }, ...SITUATIONS.map(s => panel(el('h3', { text: s.when }), p(s.do), el('a', { href: `#${s.open.view}`, text: s.open.label })))));
}

// A sortable, searchable table with a category drop-down.
function renderGlossary() {
  const select = el('select', { 'aria-label': 'Category' },
    el('option', { value: '', text: `All categories (${GLOSSARY.length})` }),
    ...GLOSSARY_CATEGORIES.map(cat => el('option', { value: cat, text: `${cat} (${GLOSSARY.filter(g => g[2] === cat).length})` })));
  const slot = el('div');
  const draw = () => {
    const rows = GLOSSARY.filter(g => !select.value || g[2] === select.value);
    slot.replaceChildren(table(['Term', 'Category', 'What it means'], rows.map(([term, text, cat]) => [term, cat, text]), { search: true, searchLabel: 'Search terms and meanings', countLabel: ['term', 'terms'] }));
  };
  select.addEventListener('change', draw);
  draw();
  pageEl.replaceChildren(panel(h2('Words you will hear'),
    p('Pick a category to narrow the list, search any word, or select a column header to sort A to Z.'),
    el('label', { class: 'row glossary-filter' }, el('span', { text: 'Category' }), select),
    slot));
}

const outLink = (href, text) => el('a', { href, target: '_blank', rel: 'noopener noreferrer', text });

// Where the setting behind a Learn topic is configured. Links stay visible; PowerShell is folded away.
function learnWhere(article) {
  const box = el('div', { class: 'learn-where stack' }, el('h3', { text: 'Where this is configured' }));
  if (article.where) box.append(p(article.where));
  const list = el('ul', { class: 'portal-list' });
  const shell = [];
  for (const id of article.portals || []) {
    const item = portalsFor(id);
    if (!item) continue;
    item.links.forEach((link, i) => list.append(el('li', {}, outLink(link.url, `${i === 0 ? 'Open' : 'Also'}: ${link.name}`))));
    shell.push(`# ${item.title}\n${item.powershell}`);
  }
  box.append(list, note('The portal checks your role. Ex360 does not change these settings.'));
  if (shell.length) box.append(el('details', {}, el('summary', { text: 'Same thing in PowerShell' }), el('pre', { class: 'report-pre', text: shell.join('\n\n') })));
  return box;
}

function headerExamplesBox() {
  const box = el('details', { class: 'learn-examples' }, el('summary', { text: `${HEADER_EXAMPLES.length} example headers, explained` }));
  box.append(note('Fictional messages. Open one, read the plain words, then open it in the header analyzer to see the same reading done for you.'));
  for (const ex of HEADER_EXAMPLES) {
    box.append(el('details', { class: 'learn-example' },
      el('summary', { text: ex.title }),
      p(ex.shows),
      el('h4', { text: 'Look at these lines' }),
      el('ul', {}, ...ex.lookFor.map(line => el('li', { text: line }))),
      el('pre', { class: 'report-pre', text: ex.headers }),
      el('a', { class: 'btn primary', href: `#hops?example=${encodeURIComponent(ex.id)}`, text: 'Open in the header analyzer' }),
    ));
  }
  return box;
}

function ruleScenariosBox() {
  const box = el('details', { class: 'learn-examples' }, el('summary', { text: `${RULE_SCENARIOS.length} times you would build a transport rule` }));
  box.append(p(RULE_HOW_TO));
  const part = (label, items) => [el('h4', { text: label }), el('ul', {}, ...items.map(t => el('li', { text: t })))];
  for (const r of RULE_SCENARIOS) {
    box.append(el('details', { class: 'learn-example' },
      el('summary', { text: r.title }),
      p(r.situation),
      ...part('Conditions (apply this rule if)', r.conditions),
      ...part('Exceptions (except if)', r.exceptions),
      ...part('Actions (do the following)', r.actions),
      p(r.note, 'muted'),
      el('h4', { text: 'PowerShell (created in Test mode)' }),
      el('pre', { class: 'report-pre', text: r.powershell }),
    ));
  }
  return box;
}

function renderLearn() {
  const extras = { headers: headerExamplesBox, rules: ruleScenariosBox };
  pageEl.replaceChildren(el('div', { class: 'stack' }, ...LEARN.map(article => panel(
    h2(article.title),
    p(article.body),
    extras[article.id] ? extras[article.id]() : null,
    learnWhere(article),
    outLink(article.learn, 'Microsoft Learn'),
  ))));
}

function renderPlaybooks() {
  const root = el('div', { class: 'stack' });
  root.append(panel(h2('Look up an NDR'), p('Paste a bounce. Ex360 matches the 5.7 code and does not change anything.'), (() => {
    const input = el('input', { type: 'search', placeholder: '550 5.7.520 ...' });
    const out = el('div');
    input.addEventListener('input', () => {
      const hit = lookupNdr(input.value);
      out.replaceChildren(hit ? panel(el('h3', { text: `${hit.code} ${hit.title}` }), p(hit.cause), p(hit.fix), el('a', { href: hit.learn, target: '_blank', rel: 'noopener noreferrer', text: 'Microsoft Learn' })) : note(input.value ? 'No 5.7 code in that text.' : ''));
    });
    return el('div', { class: 'stack' }, input, out);
  })()));
  root.append(panel(h2('Every 5.7 code in this list'), table(['Code', 'What it means', 'What to change'], NDR.map(row => [row.code, row.cause, row.fix]))));
  root.append(panel(h2('Sign-in errors'), p('Paste the AADSTS code from a failed Ex360 sign-in.'), (() => {
    const input = el('input', { type: 'search', placeholder: 'AADSTS7000218' });
    const out = el('div');
    const show = value => {
      const hit = lookupSignInError(value);
      out.replaceChildren(hit ? panel(el('h3', { text: `${hit.code} ${hit.title}` }), p(hit.cause), p(hit.fix)) : note(value ? 'No matching sign-in code.' : ''));
    };
    input.addEventListener('input', () => show(input.value));
    return el('div', { class: 'stack' }, input, table(['Code', 'What it means', 'What to change'], SIGN_IN_ERRORS.map(row => [row.code, row.cause, row.fix])), out);
  })()));
  for (const book of PLAYBOOKS) {
    root.append(panel(h2(book.title), p(book.symptoms), steps(book.steps), el('pre', { text: book.powershell })));
  }
  pageEl.replaceChildren(root);
}

function skuRows() {
  const skus = state.org?.skus;
  const block = denied(skus);
  if (block) return callout(block);
  if (!Array.isArray(skus)) return note('No license data.');
  const rows = skus.map(s => (s.part ? s : normalizeSku(s)));
  // Same columns as Microsoft 365 admin center > Billing > Licenses: Name, Available licenses, Assigned licenses.
  // The part number and status stay in the row's details flyout, not as extra columns.
  return table(['Name', 'Available licenses', 'Assigned licenses', 'Account type'], rows.map(s => [objCell(s.name, 'sku', { skuId: s.skuId, id: s.id }), { show: String(s.remaining ?? ''), text: String(s.remaining ?? ''), sort: Number(s.remaining) || 0 }, { show: `${s.consumed ?? 0}/${s.enabled ?? 0}`, text: `${s.consumed ?? 0}/${s.enabled ?? 0}`, sort: Number(s.consumed) || 0 }, 'Organization']), {
    onRowClick: i => { const s = rows[i]; openDetails(s.name, table(['Setting', 'Value'], [['Product name', s.name], ['Part number (SKU)', s.part || DASH], ['Status', s.status || 'Enabled'], ['Assigned licenses', s.consumed ?? 0], ['Total licenses', s.enabled ?? 0], ['Available licenses', s.remaining ?? 0]])); },
    rowLabel: i => `Open details for ${rows[i].name}`, countLabel: ['license', 'licenses'] });
}

// Says on the page itself whose data this is, so demo rows are never mistaken for the real tenant.
function sourceBanner() {
  if (state.demo || state.org?.source === 'demo') {
    return el('div', { class: 'callout warn', role: 'status' }, el('strong', { text: 'Demo data: fictional Contoso, not your tenant' }), p('These licenses, domains and rules are sample data. Select Sign in in the left pane and wait for LIVE at the top to see your own tenant.'));
  }
  return el('div', { class: 'callout', role: 'status' }, el('strong', { text: 'Live data, read-only' }), p(`Read from your tenant${state.org?.tenant ? ` (${state.org.tenant})` : ''} with your own sign-in.`));
}

function renderLicenses() {
  const skus = Array.isArray(state.org?.skus) ? state.org.skus : [];
  const features = featureStatus(skus);
  const root = el('div', { class: 'stack' });
  const block = denied(state.org?.skus);
  root.append(sourceBanner());
  root.append(panel(h2('Licenses'), block ? callout(block) : skuRows()));
  if (!features.find(f => f.id === 'mdo-p1')?.unlocked) root.append(el('div', { class: 'callout warn' }, el('strong', { text: 'Defender for Office 365 is not in these subscriptions. ' }), 'Safe Links, Safe Attachments and impersonation stay locked until the tenant has Plan 1 or Plan 2.'));
  root.append(portals('licenses'));
  pageEl.replaceChildren(root);
}

// Microsoft 365 admin center > Settings > Domains shows Domain name and Status. Ex360 works the status out
// the same way: unverified, records with problems, or healthy. The DNS details are in the panel per domain.
function domainStatus(domain) {
  if (/unverified/i.test(domain.type || '')) return 'Unverified';
  const dns = domain.dns;
  if (!dns) return domain.dnsError ? 'DNS not checked' : 'Healthy';
  const problems = [...(dns.mx?.problems || []), ...(dns.spf?.problems || []), ...(dns.autodiscover?.problems || [])];
  return problems.length ? 'Possible service issues' : 'Healthy';
}

function renderDomains() {
  const root = el('div', { class: 'stack' });
  const domains = state.org?.domains;
  const block = denied(domains);
  root.append(panel(h2('Domains'), block ? callout(block) : showInto(domains, ['Domain name', 'Status'], d => [objCell(d.default ? `${d.name} (Default)` : d.name, 'domain', { name: d.name }), domainStatus(d)])));
  if (Array.isArray(domains)) {
    for (const domain of domains) {
      if (!domain.dns) continue;
      const problems = [
        ...(domain.dns.mx?.problems || []), ...(domain.dns.spf?.problems || []), ...(domain.dns.dmarc?.problems || []),
        ...(domain.dns.dkim || []).flatMap(d => d.problems), ...(domain.dns.mtaSts?.problems || []), ...(domain.dns.tlsRpt?.problems || []), ...(domain.dns.autodiscover?.problems || []),
      ];
      root.append(panel(h2(domain.name), problems.length ? el('ul', { class: 'plain' }, ...problems.map(item => el('li', { text: item }))) : p('No DNS problems in this check.'), el('pre', { text: [domain.dns.spf?.record, domain.dns.dmarc?.record].filter(Boolean).join('\n') })));
    }
  }
  root.append(panel(h2('Check any domain live'), p('This uses public DNS from the machine running Ex360. It does not need a sign-in.'), (() => {
    const input = el('input', { type: 'search', value: 'contoso.com' });
    const out = el('div');
    const button = el('button', { class: 'btn', type: 'button', text: 'Check DNS' });
    button.addEventListener('click', () => busy(button, 'Checking DNS…', async () => {
      out.replaceChildren(note(`Checking ${input.value} in public DNS…`));
      const result = await get(`/api/dns?domain=${encodeURIComponent(input.value)}`);
      out.replaceChildren(result.ok === false ? callout({ label: 'DNS', message: result.message, authorized: true }) : p((result.problems || []).join(' ') || 'No problems returned.'));
    }));
    return el('div', { class: 'stack' }, input, button, out);
  })()));
  if (state.org?.settings) {
    root.append(panel(h2('Accepted domains in Exchange'), p('Authoritative means every mailbox for the domain lives here; unknown addresses bounce. Internal relay means unknown addresses are passed on through a connector.'), showInto(rowsOrDenied('accepted'), ['Name', 'Accepted domain', 'Domain type'], d => [objCell(d.Name || d.DomainName, 'domain', { name: d.DomainName }), `${d.DomainName}${d.Default ? ' (default)' : ''}`, d.DomainType])));
    root.append(panel(h2('DKIM signing in Exchange Online'), showInto(rowsOrDenied('dkim'), ['Name', 'Toggle', 'Status'], d => [objCell(d.Domain, 'domain', { name: d.Domain }), d.Enabled ? 'Enabled' : 'Disabled', d.Status || '']), portalDetails(['dkim'])));
    root.append(panel(h2('Remote domains'), p('Settings for mail sent to other organizations: automatic replies, auto-forwarding and formats. The Default (*) entry covers every domain not listed.'), remoteDomainTable(rowsOrDenied('remote'))));
  } else showRows(root, state.org?.remoteDomains, ['Name', 'Remote domain'], r => [xc('remoteDomain', r.name), r.domain], 'No remote domains.');
  root.append(portals('accepted-domains'), portals('remote-domains'), portals('spf-dmarc'), portals('dkim'));
  pageEl.replaceChildren(root);
}
// Remote domains: the Exchange admin center list shows Name and Remote domain; selecting one shows its settings.
function remoteDomainTable(value) {
  const block = denied(value);
  if (block) return callout(block);
  if (!Array.isArray(value) || !value.length) return note('No remote domains.');
  return table(['Name', 'Remote domain'], value.map(r => [xc('remoteDomain', r.Name), r.DomainName]), { onRowClick: i => {
    const r = value[i];
    openDetails(r.Name, table(['Setting', 'Value'], [['Remote domain', r.DomainName], ['Allow automatic forwarding', yn(r.AutoForwardEnabled)], ['Allow automatic replies', yn(r.AutoReplyEnabled)], ['Out of office replies', r.AllowedOOFType || DASH], ['Allow delivery reports', yn(r.DeliveryReportEnabled)], ['Allow non-delivery reports', yn(r.NDREnabled)], ['Use rich-text format (TNEF)', r.TNEFEnabled == null ? 'Follow user settings' : yn(r.TNEFEnabled)]]));
  } });
}
function showInto(value, headers, mapRow, empty, details) {
  const holder = el('div');
  showRows(holder, value, headers, mapRow, empty, details);
  return holder;
}

// Connectors: the same list as Exchange admin center > Mail flow > Connectors (Status, Name, From, To).
// Selecting a connector opens every setting Ex360 read for it.
const CONNECTOR_SIDE = { Partner: 'Partner organization', OnPremises: "Your organization's email server" };
function connectorDetails(c, direction) {
  const rows = direction === 'inbound'
    ? [['Direction', 'Inbound'], ['Type', c.ConnectorType], ['Status', c.Enabled === false ? 'Off' : 'On'], ['Sender domains', (Array.isArray(c.SenderDomains) ? c.SenderDomains : [c.SenderDomains]).filter(Boolean).map(d => String(d).replace(/^smtp:/i, '').replace(/;\d+$/, '')).join(', ') || DASH], ['Sender IP addresses', joined(c.SenderIPAddresses) || DASH], ['Require TLS', yn(c.RequireTls)], ['Reject mail not sent from this certificate or IP', c.RestrictDomainsToCertificate ? `Certificate ${c.TlsSenderCertificateName || ''}` : c.RestrictDomainsToIPAddresses ? 'IP addresses' : 'No'], ['Enhanced filtering', c.EFSkipLastIP ? 'Skip last IP' : joined(c.EFSkipIPs) || 'Off'], ['Created by', c.ConnectorSource || DASH], ['Comment', c.Comment || '']]
    : [['Direction', 'Outbound'], ['Type', c.ConnectorType], ['Status', c.Enabled === false ? 'Off' : 'On'], ['Recipient domains', c.AllAcceptedDomains ? 'All accepted domains' : joined(c.RecipientDomains) || '*'], ['Route', c.UseMXRecord ? 'MX record of the recipient domain' : `Smart hosts: ${joined(c.SmartHosts)}`], ['TLS', c.TlsSettings || 'Opportunistic'], ['TLS domain', c.TlsDomain || DASH], ['Only used by mail flow rules', yn(c.IsTransportRuleScoped)], ['Created by', c.ConnectorSource || DASH], ['Comment', c.Comment || '']];
  const eac = portalsFor('connectors')?.links?.[0];
  openDetails(c.Name, table(['Setting', 'Value'], rows), eac ? el('a', { class: 'btn primary', href: eac.url, target: '_blank', rel: 'noopener noreferrer', text: 'Edit this connector in the Exchange admin center' }) : null);
}
function renderConnectors() {
  const root = el('div', { class: 'stack' });
  const inbound = rowsOrDenied('inbound');
  const outbound = rowsOrDenied('outbound');
  const eac = portalsFor('connectors')?.links?.[0];
  const head = panel(el('div', { class: 'spread' }, h2('Connectors'), eac ? el('a', { class: 'btn primary', href: eac.url, target: '_blank', rel: 'noopener noreferrer', text: 'Open Mail flow > Connectors in the Exchange admin center' }) : null),
    p('The same list as the Exchange admin center. Select a connector to see its TLS, domains and smart hosts.', 'muted'));
  root.append(head);
  if (inbound || outbound) {
    for (const block of [inbound, outbound]) if (denied(block)) head.append(callout(block));
    const all = [
      ...(Array.isArray(inbound) ? inbound.map(c => ({ c, dir: 'inbound', from: CONNECTOR_SIDE[c.ConnectorType] || c.ConnectorType, to: 'Office 365' })) : []),
      ...(Array.isArray(outbound) ? outbound.map(c => ({ c, dir: 'outbound', from: 'Office 365', to: CONNECTOR_SIDE[c.ConnectorType] || c.ConnectorType })) : []),
    ];
    head.append(table(['Status', 'Name', 'From', 'To'], all.map(x => [x.c.Enabled === false ? 'Off' : 'On', xc('connector', x.c.Name), x.from, x.to]), { onRowClick: i => connectorDetails(all[i].c, all[i].dir), search: true, searchLabel: 'Search connectors', firstIsHeader: false }));
  } else {
    showRows(head, state.org?.connectors, ['Status', 'Name', 'From', 'To'], c => [c.enabled === false ? 'Off' : 'On', xc('connector', c.name), c.direction === 'Inbound' ? 'Partner organization' : 'Office 365', c.direction === 'Inbound' ? 'Office 365' : 'Partner organization'], 'No connectors.');
  }
  root.append(el('a', { class: 'btn', href: '#review', text: 'See connector findings in Config review' }));
  root.append(portals('connectors'));
  pageEl.replaceChildren(root);
}

// Mail flow rules: the same list as Exchange admin center > Mail flow > Rules, same columns, same order.
// Selecting a row opens the rule's details, like the portal's details panel. Read-only.
const checkMark = (on, yes = 'Yes', no = 'No') => (on == null ? DASH : { show: el('span', { class: on ? 'tick yes' : 'tick no', title: on ? yes : no, 'aria-label': on ? yes : no, text: on ? '✓' : '✕' }), text: on ? yes : no, sort: on ? 1 : 0 });
function ruleDetails(rule) {
  const words = describeRule(rule.Description);
  const listOf = items => (items.length ? el('ul', { class: 'plain' }, ...items.map(t => el('li', { text: t }))) : p('None', 'muted'));
  const warnings = ruleWarnings(rule);
  const row = ruleListRow(rule);
  const eac = portalsFor('transport-rules')?.links?.[0];
  openDetails(rule.Name,
    el('div', { class: 'row' }, el('span', { class: rule.State === 'Enabled' ? 'badge live' : 'badge', text: rule.State || 'Unknown state' }), row.lastExecutionWords ? el('span', { class: 'muted', text: `Last execution ${row.lastExecutionWords}` }) : null),
    warnings.length ? el('div', { class: 'callout warn' }, el('ul', { class: 'plain' }, ...warnings.map(t => el('li', { text: t })))) : null,
    el('h3', { text: 'Apply this rule if' }), listOf(words.conditions),
    el('h3', { text: 'Do the following' }), listOf(words.actions),
    el('h3', { text: 'Except if' }), listOf(words.exceptions),
    el('h3', { text: 'Rule settings' }), table(['Setting', 'Value'], ruleSettings(rule)),
    el('h3', { text: 'Rule description, as Exchange returns it' }), el('pre', { class: 'report-pre', text: rule.Description || 'Exchange did not return a description.' }),
    eac ? el('a', { class: 'btn primary', href: eac.url, target: '_blank', rel: 'noopener noreferrer', text: 'Edit this rule in the Exchange admin center' }) : null,
    p('Ex360 only reads. The portal checks your role before it lets you change anything.', 'muted'),
  );
}
function renderRules() {
  const root = el('div', { class: 'stack' });
  const raw = rowsOrDenied('rules');
  const eac = portalsFor('transport-rules')?.links?.[0];
  const head = panel(
    el('div', { class: 'spread' }, h2('Rules'), eac ? el('a', { class: 'btn primary', href: eac.url, target: '_blank', rel: 'noopener noreferrer', text: 'Open Mail flow > Rules in the Exchange admin center' }) : null),
    p('The same list as the Exchange admin center, in the same columns. Rules run from priority 0 down. Select a rule to see its conditions, actions and exceptions.', 'muted'),
  );
  root.append(head);
  if (Array.isArray(raw)) {
    const rules = [...raw].sort((a, b) => Number(a.Priority ?? 0) - Number(b.Priority ?? 0));
    const now = Date.now();
    const rows = rules.map(r => {
      const x = ruleListRow(r, now);
      return [
        x.status,
        xc('transportRule', x.name),
        x.priority ?? DASH,
        checkMark(x.stop),
        x.size ?? DASH,
        x.lastExecution ? { show: el('span', { title: String(x.lastExecution), text: x.lastExecutionWords }), text: x.lastExecutionWords, sort: x.lastExecutionAt ?? x.lastExecution } : DASH,
        checkMark(x.supported),
        x.unsupportedReason,
      ];
    });
    const wanted = String(queryFromHash(location.hash).rule || '').trim().toLowerCase();
    const hit = wanted ? rules.find(r => String(r.Name || '').trim().toLowerCase() === wanted) : null;
    if (wanted && !hit) head.append(callout({ label: 'Rule not found', message: `No mail flow rule is named "${queryFromHash(location.hash).rule}". It may have been renamed or removed since the message was processed.`, authorized: true }));
    if (hit) setTimeout(() => ruleDetails(hit), 0);
    head.append(table(RULE_COLUMNS, rows, { className: 'rules-grid', onRowClick: i => ruleDetails(rules[i]), rowLabel: i => `Open details for rule ${rules[i].Name}`, search: true, searchLabel: 'Search rules', countLabel: ['item', 'items'], firstIsHeader: false }));
    const missing = ['Size', 'LastExecution', 'ConfigurationSupported'].filter(k => rules.length && rules.every(r => r[k] == null || r[k] === ''));
    if (missing.length && !state.demo) head.append(note(`A dash means Exchange Online PowerShell did not return that column for your rules (${missing.map(k => ({ Size: 'Size (Bytes)', LastExecution: 'Last execution', ConfigurationSupported: 'Configuration supported' })[k]).join(', ')}). The portal reads it from a source Ex360 cannot reach with read-only PowerShell.`));
  } else if (raw) head.append(callout(raw));
  else {
    const rules = Array.isArray(state.org?.transportRules) ? state.org.transportRules : null;
    const block = denied(state.org?.transportRules);
    if (block) head.append(callout(block));
    else if (rules) head.append(table(RULE_COLUMNS, rules.map(r => [r.state || DASH, xc('transportRule', r.name), r.priority ?? DASH, DASH, DASH, DASH, DASH, '']), { search: true, searchLabel: 'Search rules', firstIsHeader: false }));
    else head.append(note('No mail flow rules.'));
  }
  root.append(portals('transport-rules'));
  pageEl.replaceChildren(root);
}

// Organization > Security policies: the parent page says which policy wins; each kind of policy has its own page.
const SEC_AREAS = {
  'sec-antispam': { title: 'Anti-spam (inbound)', kind: 'antiSpam', policy: 'spamPolicy', rule: 'spamRule', key: 'HostedContentFilterPolicy', portal: 'anti-spam', older: 'antiSpam' },
  'sec-antiphish': { title: 'Anti-phishing, spoofing and impersonation', kind: 'antiPhish', policy: 'phishPolicy', rule: 'phishRule', key: 'AntiPhishPolicy', portal: 'anti-phish', older: 'antiPhish' },
  'sec-antimalware': { title: 'Anti-malware', kind: 'antiMalware', policy: 'malwarePolicy', rule: 'malwareRule', key: 'MalwareFilterPolicy', portal: 'anti-malware' },
  'sec-safelinks': { title: 'Safe Links (Defender)', kind: 'safeLinks', policy: 'safeLinksPolicy', rule: 'safeLinksRule', key: 'SafeLinksPolicy', portal: 'safe-links' },
  'sec-safeattach': { title: 'Safe Attachments (Defender)', kind: 'safeAttachments', policy: 'safeAttachPolicy', rule: 'safeAttachRule', key: 'SafeAttachmentPolicy', portal: 'safe-attachments' },
  'sec-outbound': { title: 'Outbound spam and automatic forwarding', kind: 'outbound', policy: 'outboundPolicy', rule: 'outboundRule', key: 'HostedOutboundSpamFilterPolicy', portal: 'outbound-spam' },
  'sec-connection': { title: 'Connection filter and tenant allow list', portal: 'anti-spam' },
  'sec-quarantine': { title: 'Quarantine policies', portal: 'quarantine-policies' },
};
const noSettings = () => note('Exchange Online security settings were not read. Connect Exchange with Sign in at the top, then choose Read again.');
function renderSecurity() {
  const root = el('div', { class: 'stack' });
  const s = settingsOf();
  if (!state.org?.settings) root.append(panel(h2('Which policy wins'), noSettings()));
  else {
    const presets = [...(s.presetEop || []), ...(s.presetAtp || [])];
    root.append(panel(h2('Which policy wins'), p('For one person, Exchange uses the first match in this order: Strict preset, Standard preset, custom policies by priority, then Built-in protection (Defender) or the Default policy. Single recipient > Policies that apply works this out for a named person.'),
      presets.length ? table(['Preset', 'Part', 'State', 'Applies to'], presets.map(r => [xc('presetPolicy', r.Name), r.SafeLinksPolicy ? 'Defender (Safe Links, Safe Attachments, impersonation)' : 'Exchange Online Protection (spam, malware, phish)', r.State, [joined(r.SentTo), joined(r.SentToMemberOf), joined(r.RecipientDomainIs)].filter(Boolean).join('; ') || 'Nobody named'])) : note('No preset policies are turned on.')));
  }
  root.append(panel(h2('Policy pages'), p('Each kind of policy has its own page under Security policies in the left pane.', 'muted'),
    el('div', { class: 'row' }, ...Object.keys(SEC_AREAS).map(id => el('a', { class: 'btn', href: `#${id}`, text: PAGES.find(pg => pg.id === id)?.title || id })))));
  pageEl.replaceChildren(root);
}
function renderSecurityArea(id) {
  const area = SEC_AREAS[id];
  const root = el('div', { class: 'stack' });
  const s = settingsOf();
  if (!state.org?.settings) {
    if (area.older) root.append(panel(h2(area.title), showInto(state.org?.[area.older], ['Name', 'Status', 'Priority', 'Type'], r => [xc(area.kind, r.name), /disabled|off/i.test(r.state || '') ? 'Off' : 'On', r.priority ?? DASH, r.policy || DASH])));
    else root.append(panel(h2(area.title), noSettings()));
  } else if (area.kind) {
    root.append(panel(h2(area.title), policyTable(area.kind, rowsOrDenied(area.policy), s[area.rule], area.key), portalDetails([area.portal])));
  } else if (id === 'sec-connection') {
    root.append(panel(h2(area.title), showInto(rowsOrDenied('connectionPolicy'), ['Policy', 'IP allow list', 'IP block list', 'Microsoft safe list'], c => [xc('connectionFilter', c.Name), joined(c.IPAllowList) || 'None', joined(c.IPBlockList) || 'None', yn(c.EnableSafeList)]), showInto(rowsOrDenied('allowSenders'), ['Value', 'Action', 'Override verdicts', 'Modified by', 'Last updated', 'Last used date', 'Remove on', 'Notes'], a => [a.Value, a.Action || 'Allow', '', a.ModifiedBy || '', whenCell(a.LastModifiedDateTime), whenCell(a.LastUsedDate), a.ExpirationDate ? whenCell(a.ExpirationDate) : 'Never', a.Notes || ''], 'No tenant allow entries for senders.')));
  } else {
    root.append(panel(h2(area.title), showInto(rowsOrDenied('quarantine'), ['Policy name', 'Last updated'], q => [xc('quarantinePolicy', q.Name), whenCell(q.WhenChanged)], 'No quarantine policies.', q => [['What the user may do', Number(q.EndUserQuarantinePermissionsValue) === 0 ? 'Nothing (admin only)' : `Permissions value ${q.EndUserQuarantinePermissionsValue}`], ['Quarantine notifications', yn(q.ESNEnabled)]]), el('a', { class: 'btn', href: '#quarantine', text: 'See what is in quarantine' }), portalDetails([area.portal])));
  }
  root.append(el('div', { class: 'row' }, el('a', { class: 'btn', href: '#security', text: 'Which policy wins' })));
  pageEl.replaceChildren(root);
}

function renderConfig() {
  const config = state.org?.config;
  const root = el('div', { class: 'stack' });
  const s = settingsOf();
  if (!state.org?.settings) {
    if (denied(config)) root.append(callout(config));
    else if (config) root.append(panel(h2('Organization'), table(['Setting', 'Value'], [
      ['Modern authentication (OAuth2 client profile)', config.modernAuth ? 'On' : 'Off'],
      ['SMTP AUTH disabled for the organization', config.smtpAuthDisabled ? 'Yes' : 'No'],
      ['Authentication policies', (config.authPolicies || []).join(', ') || 'See Exchange'],
      ['Retention policies', (config.retention || []).join(', ')],
    ])));
    root.append(portals('auth-policies'), portals('owa-mobile'), portals('retention'));
    pageEl.replaceChildren(root);
    return;
  }
  const org = (s.org || [])[0] || {};
  const t = (s.transport || [])[0] || {};
  const tag = (s.externalTag || [])[0] || {};
  const audit = (s.auditConfig || [])[0] || {};
  const orgErr = settingsError('org');
  root.append(panel(h2('Organization and authentication'), orgErr ? callout(orgErr) : table(['Setting', 'Value', 'What it means'], [
    ['Modern authentication for Outlook', yn(org.OAuth2ClientProfileEnabled), 'Off means Outlook cannot use MFA or Conditional Access.'],
    ['SMTP AUTH turned off for everyone', yn(t.SmtpClientAuthenticationDisabled), 'No means any mailbox can send with a password over SMTP AUTH.'],
    ['Default authentication policy', org.DefaultAuthenticationPolicy || 'None', 'Blocks basic authentication per protocol for everyone not assigned another policy.'],
    ['Mailbox auditing turned off', yn(org.AuditDisabled), 'Should be No. Yes stops mailbox audit records.'],
    ['Unified audit log', yn(audit.UnifiedAuditLogIngestionEnabled), 'Should be Yes, or audit search finds nothing.'],
    ['External tag in Outlook', yn(tag.Enabled), 'Marks mail from outside the organization.'],
    ['Max send and receive size', `${t.MaxSendSize || '—'} / ${t.MaxReceiveSize || '—'}`, 'Organization limits. Mailboxes can be lower.'],
    ['Reply-all storm protection', yn(t.ReplyAllStormProtectionEnabled), 'Stops runaway reply-all threads.'],
  ])));
  root.append(panel(h2('Authentication policies (basic auth per protocol)'), showInto(rowsOrDenied('auth'), ['Policy', 'SMTP', 'POP', 'IMAP', 'ActiveSync', 'EWS', 'Autodiscover'], a => [xc('authPolicy', a.Name), yn(a.AllowBasicAuthSmtp), yn(a.AllowBasicAuthPop), yn(a.AllowBasicAuthImap), yn(a.AllowBasicAuthActiveSync), yn(a.AllowBasicAuthWebServices), yn(a.AllowBasicAuthAutodiscover)], 'No authentication policies.'), portalDetails(['auth-policies', 'conditional-access'])));
  const tags = s.retentionTags || [];
  root.append(panel(h2('Exchange retention (MRM) policies'), p('MRM moves mail to the archive or deletes it on a schedule. It does not preserve mail; Purview retention does that (see Retention under Compliance).'), showInto(rowsOrDenied('retention'), ['Policy', 'Default', 'Tags'], r => [xc('mrmPolicy', r.Name), yn(r.IsDefault), joined(r.RetentionPolicyTagLinks)]), showInto(rowsOrDenied('retentionTags'), ['Tag', 'Type', 'After', 'Action', 'On'], r => [xc('mrmPolicy', r.Name), r.Type, String(r.AgeLimitForRetention || '').replace(/\.00:00:00$/, ' days'), r.RetentionAction, yn(r.RetentionEnabled)], tags.length ? '' : 'No retention tags.'), portalDetails(['retention'])));
  root.append(panel(h2('Mailbox policies'), showInto(rowsOrDenied('owa'), ['Outlook on the web policy', 'Default', 'Other storage providers', 'Direct file access on public computers'], r => [xc('owaPolicy', r.Name), yn(r.IsDefault), yn(r.AdditionalStorageProvidersAvailable), yn(r.DirectFileAccessOnPublicComputersEnabled)]), showInto(rowsOrDenied('mobile'), ['Mobile device policy', 'Default', 'Password required', 'Non-provisionable devices allowed'], r => [r.Name, yn(r.IsDefault), yn(r.PasswordEnabled), yn(r.AllowNonProvisionableDevices)]), showInto(rowsOrDenied('sharing'), ['Sharing policy', 'Default', 'Enabled', 'Domains'], r => [r.Name, yn(r.Default), yn(r.Enabled), joined(r.Domains)]), portalDetails(['owa-mobile'])));
  pageEl.replaceChildren(root);
}

const HEALTH_WORDS = { serviceOperational: 'Healthy', serviceDegradation: 'Service degradation', serviceInterruption: 'Service interruption', restoringService: 'Restoring service', investigating: 'Investigating', extendedRecovery: 'Extended recovery', falsePositive: 'False positive', serviceRestored: 'Service restored', investigationSuspended: 'Investigation suspended', postIncidentReviewPublished: 'Post-incident report published' };
function healthTable(services) {
  const block = denied(state.org?.health);
  if (block) return callout(block);
  const rows = Array.isArray(services) ? services : [];
  if (!rows.length) return note('No service health rows.');
  // Microsoft 365 admin center > Health > Service health, Overview tab: Service and Health.
  return table(['Service', 'Health'], rows.map(s => [objCell(s.service || s.name, 'healthService', { name: s.id || s.service || s.name }), HEALTH_WORDS[s.status] || s.status]));
}
function renderHealth() {
  const root = el('div', { class: 'stack' });
  const open = (href, text, primary) => el('a', { class: `btn${primary ? ' primary' : ''}`, href, target: '_blank', rel: 'noopener noreferrer', text });
  root.append(panel(h2('Microsoft 365 service health'), p('Your tenant\'s own view: Exchange Online, Exchange Online Protection, Microsoft Defender for Office 365, Microsoft Entra ID and Microsoft Purview, with incidents and advisories that affect your organization. Check this first.', 'muted'),
    el('div', { class: 'row' }, open(HEALTH_LINKS.m365, 'Open Service health', true), open(HEALTH_LINKS.messageCenter, 'Open Message center'))));
  root.append(panel(h2('Current status'), healthTable(state.org?.health?.services || state.org?.health)));
  const issues = state.org?.health?.issues;
  if (Array.isArray(issues) && issues.length) root.append(panel(h2('Active issues'), table(['Title', 'Affected services', 'Issue type', 'Status', 'Last updated'], issues.map(i => [objCell(i.title, 'healthIssue', { id: i.id }), i.service || DASH, i.classification ? (i.classification === 'incident' ? 'Incident' : 'Advisory') : DASH, HEALTH_WORDS[i.status] || i.status || DASH, i.lastModifiedDateTime ? { show: formatUtc(i.lastModifiedDateTime), text: formatUtc(i.lastModifiedDateTime), sort: toTime(i.lastModifiedDateTime) } : DASH]))));
  root.append(panel(h2('Other status pages that affect mail flow'), table(['Page', 'When to use it', 'Sign-in'], HEALTH_SITES.map(site => [site.name, site.when, site.signIn])),
    el('div', { class: 'row' }, ...HEALTH_SITES.map(site => open(site.url, `Open ${site.name}`)))));
  root.append(portals('service-health'));
  pageEl.replaceChildren(root);
}
function asRows(value) {
  if (denied(value)) return value;
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.value)) return value.value;
  return [];
}
async function complianceData() {
  if (!state.compliance) state.compliance = await shared(`/api/compliance${demoQuery()}`);
  return state.compliance;
}
function grantLinks() {
  if (state.demo) return note('Demo mode shows Contoso. Live reads use a second sign-in after the new permissions are on the app.');
  const view = currentView();
  return el('div', { class: 'row' },
    el('a', { class: 'btn', href: loginPath({ resource: 'purview', returnTo: view, consent: true }), text: 'Sign in for Purview reads' }),
    el('a', { class: 'btn', href: loginPath({ resource: 'compliance', returnTo: view, consent: true }), text: 'Sign in for compliance PowerShell' }),
  );
}
function licenseLine(feature) {
  const gap = (state.compliance?.licenses || []).find(item => item.id === feature && !item.unlocked);
  if (!gap) return null;
  return callout({ label: 'License required', licensed: false, message: `${gap.name} needs ${gap.needs}.` });
}
function mailboxWho() {
  const box = mb() || {};
  return { address: box.primary || '', primary: box.primary || '', id: box.id || '', memberOf: box.memberOf || [] };
}
function renderOnprem() {
  pageEl.replaceChildren(panel(
    el('p', { class: 'badge', text: ONPREM.status }),
    h2(ONPREM.title),
    p(ONPREM.body),
    el('ul', { class: 'plain' }, ...ONPREM.later.map(item => el('li', { text: item }))),
  ));
}

async function ensureBox() {
  if (state.box && state.box.mailbox?.id === state.mailboxId) return;
  const id = state.mailboxId || (state.demo ? 'megan.bowen@contoso.com' : '');
  if (!id) { state.box = null; return; }
  const source = state.demo ? '&demo=1' : `&source=${encodeURIComponent(state.mailboxSource || 'user')}`;
  const data = await shared(`/api/mailbox?id=${encodeURIComponent(id)}${source}`);
  state.box = data.view || null;
  state.boxError = data.view ? null : data;
  if (state.box && !state.mailboxId) state.mailboxId = state.box.mailbox.id;
  markApplicable();
}
// Single recipient works for every recipient that can receive email. Pages that do not apply to the open
// recipient stay in the rail, dimmed and marked N/A, and say why when opened.
function recipientKind() { return mb()?.kind || (mb() ? recipientType(mb().type).kind : null); }
function markApplicable() {
  const kind = recipientKind();
  for (const link of document.querySelectorAll('#navigation a[data-view]')) {
    const verdict = pageApplies(link.dataset.view, kind);
    link.classList.toggle('not-applicable', !verdict.applies);
    link.querySelector('.na-tag')?.remove();
    if (!verdict.applies) {
      link.append(el('span', { class: 'na-tag', text: 'N/A', title: verdict.reason }));
      link.setAttribute('title', `Not applicable to ${mb().displayName}: ${verdict.reason}`);
    } else link.removeAttribute('title');
  }
}
function notApplicable(id) {
  const verdict = pageApplies(id, recipientKind());
  if (verdict.applies) return null;
  return el('div', { class: 'callout', role: 'status' },
    el('strong', { text: `Not applicable to ${mb().displayName} (${mb().typeLabel || mb().type})` }),
    p(verdict.reason),
    el('div', { class: 'row' }, el('a', { class: 'btn primary', href: '#mb-recipient', text: 'Open Recipient' }), el('a', { class: 'btn', href: '#mb-policies', text: 'Policies that apply' })));
}
function openRecipient(row) {
  state.mailboxId = row.id;
  state.mailboxSource = ['group', 'contact', 'exo'].includes(row.source) ? row.source : 'user';
  state.box = null; state.report = null; state.signins = null;
  // Kept for this browser tab, so a reload still has the same recipient open on every Single recipient page.
  try { sessionStorage.setItem('ex360-recipient', JSON.stringify({ id: state.mailboxId, source: state.mailboxSource })); } catch { /* storage unavailable */ }
  render();
}
// A search result: the name selects the recipient for every Single recipient page. The portal chips under it
// still open the admin portals in a new tab.
function pickCell(r) {
  const cell = objCell(r.displayName, linkKindFor(r), { id: r.id, upn: r.primary, type: r.type });
  const name = cell.show.querySelector('.obj-link, .obj-name');
  const select = el('a', { class: 'obj-link pick-link', href: '#mb-recipient', title: `Open ${cell.text} in Ex360`, text: cell.text, onclick: event => { event.preventDefault(); event.stopPropagation(); openRecipient(r); } });
  if (name) name.replaceWith(select); else cell.show.prepend(select);
  return cell;
}
function picker() {
  const loaded = mb()?.primary || '';
  const input = el('input', { type: 'search', value: loaded || (state.demo ? 'Megan Bowen' : ''), placeholder: 'Name or email address', 'aria-label': 'Recipient name or email address' });
  const button = el('button', { class: 'btn primary', type: 'submit', text: 'Search recipients' });
  const form = el('form', { class: 'row' }, input, button);
  const list = el('div', { class: 'stack' });
  form.addEventListener('submit', event => {
    event.preventDefault();
    busy(button, 'Searching…', () => searchRecipients(input.value.trim()));
  });
  const searchRecipients = async q => {
    list.replaceChildren(note(state.demo ? 'Searching the Contoso demo recipients…' : 'Searching Microsoft Entra ID and Exchange Online…'));
    const found = await get(`/api/mailboxes?q=${encodeURIComponent(q)}${demoAnd()}`);
    list.replaceChildren();
    if (denied(found) || found.ok === false) { list.append(callout(denied(found) || { ...found, authorized: true })); return; }
    const rows = found.value || [];
    if (!rows.length) { list.append(note('No recipient matched. Search by the start of the display name or email address.')); return; }
    // Same columns as Exchange admin center > Recipients: Display name, Email address, Recipient type.
    list.append(table(['Display name', 'Email address', 'Recipient type'], rows.map(r => [pickCell(r), r.primary, r.typeLabel || recipientType(r.type).label]), { onRowClick: i => openRecipient(rows[i]), rowLabel: i => `Open ${rows[i].displayName}` }));
    if (found.skipped?.length) list.append(note(`Your sign-in could not search ${found.skipped.join(' and ')}, so those are not listed.`));
  };
  const current = mb() ? p(`Open now: ${mb().displayName} (${mb().primary}), ${mb().typeLabel || mb().type}.`, 'muted') : null;
  return panel(h2('Pick a recipient'), p('Anything that receives inbound mail for this organization: user, shared, room and equipment mailboxes, Microsoft 365 groups, distribution lists, mail-enabled security groups, dynamic distribution lists, room lists, mail contacts, mail users and mail-enabled public folders. Select a name to open it on every Single recipient page. Ex360 reads it as you, with your own permissions.', 'muted'), form, current, list);
}
function mb() { return state.box?.mailbox; }
const SIGNINS_SHOWN = 10;

// The full mailbox read, shown in parts across the Single recipient pages. The pages and the PDF come from the same report model.
function reportFacts(rows) {
  const wrap = el('div', { class: 'table-wrap' });
  const t = el('table', { class: 'report-facts' });
  const body = el('tbody');
  for (const [label, value, hint] of rows) body.append(el('tr', {}, el('th', { scope: 'row', text: label }), el('td', {}, el('strong', { text: value }), hint ? el('small', { text: hint }) : null)));
  t.append(body);
  wrap.append(t);
  return wrap;
}
const TONE = { high: 'HIGH', medium: 'CHECK', low: 'LOW', info: 'INFO', ok: 'OK' };
function reportBlock(b) {
  if (b.type === 'facts') return reportFacts(b.rows);
  if (b.type === 'table') return table(b.columns, b.links ? b.rows.map((r, i) => (b.links[i] ? [objCell(r[0], b.links[i].kind, b.links[i].obj), ...r.slice(1)] : r)) : b.rows);
  if (b.type === 'text') return b.tone === 'warn' ? el('div', { class: 'callout warn', role: 'status' }, p(b.text)) : p(b.text);
  if (b.type === 'denied') return callout({ authorized: b.label === 'Not authorized' ? false : true, licensed: b.label === 'License required' ? false : undefined, label: b.label, message: b.message, permission: b.permission, role: b.role });
  if (b.type === 'list') {
    const list = el('ul', { class: 'report-list' });
    for (const item of b.items) {
      const tag = TONE[item.tone];
      list.append(el('li', { class: tag ? '' : `plain${item.tone === 'muted' ? ' muted' : ''}` }, tag ? el('span', { class: `report-tag ${item.tone}`, text: tag }) : null, el('span', { text: item.text })));
    }
    return el('div', { class: 'stack' }, b.title ? el('h3', { text: b.title }) : null, list);
  }
  return null;
}
function reportPortals(list) {
  if (!list?.length) return null;
  const details = el('details');
  details.append(el('summary', { text: 'Where to change this' }));
  for (const item of list) {
    const links = el('ul', { class: 'portal-list' });
    item.links.forEach((link, i) => links.append(el('li', {}, el('a', { href: link.url, target: '_blank', rel: 'noopener noreferrer', text: `${i === 0 ? 'Open' : 'Also'}: ${link.name}` }))));
    details.append(el('h3', { text: item.title }), links, el('pre', { class: 'report-pre', text: item.powershell }));
  }
  return details;
}
// The full mailbox read (the same model as the PDF report). Read once per recipient and shared by
// Recipient, Inbox rules and Policies that apply, so moving between them never reads twice.
function reportTimeZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
}
function reportQuery(id, fresh) {
  return `id=${encodeURIComponent(id)}&tz=${encodeURIComponent(reportTimeZone())}${state.demo ? '&demo=1' : ''}${fresh ? '&fresh=1' : ''}`;
}
// The full read is cached for the visit, so it must not be tied to the page that started it: caching a
// get() kept a STALE rejection once the person moved to another page mid-read, and every later page then
// showed "Reading the mailbox settings" forever. Cache the raw read; each caller checks it is still current.
// A read that fails is forgotten, so the next page asks again.
function loadReport(id, fresh = false) {
  if (fresh || state.report?.id !== id) {
    const entry = { id };
    entry.promise = rawGet(`/api/report?${reportQuery(id, fresh)}`).catch(error => {
      if (state.report === entry) state.report = null;
      throw error;
    });
    state.report = entry;
  }
  return stillCurrent(state.report.promise);
}
const REPORT_WAIT_MS = 5 * 60 * 1000; // the server gives Exchange Online up to four minutes
function reportSection(s) {
  const main = (s.portals?.[0] || portalsFor(panePortal(currentView(), s.title, recipientKind())))?.links?.[0];
  return el('section', { class: 'panel stack report-section', id: `report-${s.id}` },
    el('h2', { text: s.title }),
    main ? el('div', { class: 'row pane-portal' }, el('a', { class: 'btn primary sm', href: main.url, target: '_blank', rel: 'noopener noreferrer', text: `Open in portal: ${main.name}` })) : null,
    s.intro ? el('p', { class: 'report-intro', text: s.intro }) : null,
    ...s.blocks.map(reportBlock),
    reportPortals(s.portals));
}
// A holder that fills in when the full mailbox read finishes. ids picks the report sections to show, in that
// order; trim(section) may drop blocks or rows another page already shows.
function reportSlot(ids, { trim, waiting } = {}) {
  const holder = el('div', { class: 'stack' });
  const box = mb();
  if (!box || !reportApplies(recipientKind())) return holder;
  const id = box.primary || box.id;
  holder.append(panel(h2('Reading the mailbox settings'), p(waiting || (state.demo ? 'Reading the Contoso demo data.' : 'Reading Microsoft Graph, Exchange Online and Purview as you. This usually takes about a minute. Nothing is changed.'))));
  // Never leave "Reading" on screen with no end: after five minutes say so and offer a fresh read.
  const watchdog = setTimeout(() => {
    if (!holder.isConnected) return;
    if (state.report?.id === id) state.report = null;
    const again = el('button', { class: 'btn', type: 'button', text: 'Try again' });
    again.addEventListener('click', () => render());
    holder.replaceChildren(callout({ label: 'Still no answer', message: 'The full mailbox read has not answered after five minutes. Exchange Online PowerShell is usually the slow part. Try again; if it stays like this, Setup steps shows whether Exchange Online PowerShell is connected.' }), el('div', { class: 'row' }, again));
  }, REPORT_WAIT_MS);
  loadReport(id).finally(() => clearTimeout(watchdog)).then(data => {
    if (!data?.report) { holder.replaceChildren(callout(denied(data) || { label: data?.label || 'Could not read the mailbox settings', message: data?.message || 'The full mailbox read did not finish.' })); return; }
    const sections = ids.map(sid => data.report.sections.find(s => s.id === sid)).filter(Boolean).map(s => (trim ? trim(s) : s)).filter(Boolean);
    holder.replaceChildren(...sections.map(reportSection));
  }).catch(error => { if (error !== STALE) holder.replaceChildren(callout({ label: 'Could not read the mailbox settings', message: String(error?.message || error) })); });
  return holder;
}
// Recipient: the one page about a single recipient. Everything another Single recipient page already shows
// (forwarding, inbox rules, delegation, groups, policies, protocols, sign-ins, findings, compliance,
// Conditional Access, Defender XDR, message trace; the report's At a glance list is on Findings) lives only on that page, so this one holds what is left:
// who it is, its addresses, its delivery settings, and for a group its owners, members and who may send to it.
const RECIPIENT_REPORT_SECTIONS = ['account', 'mailbox', 'delivery', 'limits'];
function trimRecipientSection(s) {
  // Display name and primary address are already in General.
  if (s.id === 'account') return { ...s, blocks: s.blocks.map(b => (b.type === 'facts' ? { ...b, rows: b.rows.filter(r => r[0] !== 'Display name' && r[0] !== 'Primary email address') } : b)) };
  if (s.id === 'mailbox') return { ...s, blocks: s.blocks.map(b => (b.type === 'facts' ? { ...b, rows: b.rows.map(r => (r[0] === 'Last sign-in to the mailbox' ? [r[0], r[1], 'Exchange no longer updates this reliably. Use the Sign-ins page.'] : r)) } : b)) };
  if (s.id === 'limits') return { ...s, title: 'What Ex360 does not read for this mailbox' };
  if (s.id !== 'delivery') return s;
  // Forwarding is on Forwarding. Keep who may send, automatic replies and the remote domain line.
  const blocks = s.blocks.map(b => (b.type === 'facts' ? { ...b, rows: b.rows.filter(r => r[0] !== 'Forwarding') } : b)).filter(b => b.type !== 'facts' || b.rows.length);
  return { ...s, title: 'Delivery and automatic replies', intro: 'Who may send to this mailbox and what is sent back automatically. Forwarding is on the Forwarding page.', blocks };
}
function recipientPortal(kind) {
  return portals(kind === 'mailbox' ? 'mailboxes' : kind === 'm365group' ? 'groups-m365' : kind === 'group' ? 'groups' : 'contacts');
}
// A report download that says what it is doing: building (it can take a minute on live data), saved with
// the file name, or the exact error. A plain download link showed nothing until the file arrived.
function downloadButton(label, url, status) {
  const button = el('button', { class: 'btn', type: 'button', text: label });
  button.addEventListener('click', async () => {
    if (button.disabled) return;
    button.disabled = true;
    button.textContent = 'Building…';
    const started = Date.now();
    status.textContent = state.demo ? 'Building the report from the Contoso demo data…' : 'Building the report. Ex360 is reading Microsoft Graph, Exchange Online and Purview as you; this can take about a minute the first time.';
    const tick = setInterval(() => { status.textContent = `Building the report… ${Math.round((Date.now() - started) / 1000)} s`; }, 1000);
    try {
      const res = await fetch(url, { credentials: 'same-origin' });
      if (!res.ok) throw new Error((await res.text()).slice(0, 300) || `The server answered ${res.status}.`);
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') || '')?.[1] || 'Ex360-report';
      const href = URL.createObjectURL(blob);
      const a = el('a', { href, download: name });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 60000);
      status.textContent = `Saved ${name} (${Math.max(1, Math.round(blob.size / 1024))} KB) to your Downloads folder.`;
    } catch (error) {
      status.textContent = `The report was not downloaded: ${error.message || error}`;
    } finally {
      clearInterval(tick);
      button.disabled = false;
      button.textContent = label;
    }
  });
  return button;
}
async function renderRecipient() {
  const root = el('div', { class: 'stack' });
  root.append(picker());
  if (state.boxError) root.append(callout(state.boxError));
  const mailbox = mb();
  if (!mailbox) {
    pageEl.replaceChildren(root);
    return;
  }
  const kind = recipientKind();
  const g = mailbox.group;
  const isMailbox = kind === 'mailbox';
  // General, in the order the admin center shows it. For a mailbox, licenses, size and limits come from the
  // full read below, so they are not repeated here.
  const selfKind = linkKindFor({ source: state.mailboxSource, type: mailbox.type });
  const rows = [['Display name', objCell(mailbox.displayName, selfKind, { id: mailbox.id, upn: mailbox.primary, type: mailbox.type })], ['Primary email address', mailbox.primary], ['Recipient type', mailbox.typeLabel || mailbox.type]];
  if (mailbox.externalAddress) rows.push(['External email address', mailbox.externalAddress]);
  if (mailbox.hidden != null && !isMailbox) rows.push(['Hidden from address lists', mailbox.hidden ? 'Yes' : 'No']);
  if (kind === 'mailuser') rows.push(['Licenses', (mailbox.licenses || []).join(', ') || 'None']);
  if (kind === 'm365group') rows.push(['Size', mailbox.size || DASH]);
  if (kind === 'publicfolder') rows.push(['Forwards to', mailbox.forwarding?.smtp || 'Not set'], ['Also keeps a copy in the folder', mailbox.forwarding?.deliverAndForward ? 'Yes' : 'No']);
  const traceLink = (field, text) => el('a', { class: 'btn primary', href: `#trace?${field}=${encodeURIComponent(mailbox.primary)}&days=10&run=1`, text });
  const status = el('p', { class: 'muted', role: 'status', 'aria-live': 'polite' });
  const reportId = mailbox.primary || mailbox.id;
  root.append(panel(h2('General'), table(['Field', 'Value'], rows),
    el('div', { class: 'row' }, traceLink('recipient', 'Trace mail received'), kind === 'contact' || kind === 'publicfolder' ? null : traceLink('sender', 'Trace mail sent'),
      isMailbox ? downloadButton('Download PDF report', `/api/report.pdf?${reportQuery(reportId, false)}`, status) : null,
      isMailbox ? downloadButton('Download MHTML report', `/api/report.mhtml?${reportQuery(reportId, false)}`, status) : null),
    isMailbox ? status : null,
    isMailbox ? note('Both reports hold the full mailbox read, including the parts shown on the other Single recipient pages. The MHTML file is one web page that opens in Edge, Chrome or Word. Both are built in memory and never saved by Ex360; store them like any confidential file.') : null));
  const aliases = (mailbox.aliases || []).map(a => {
    const text = String(a);
    const [prefix, ...rest] = text.split(':');
    const kindOf = prefix === 'SMTP' ? 'Primary (replies come from this one)' : /^smtp$/i.test(prefix) ? 'Alias (also receives mail)' : /^x500$/i.test(prefix) ? 'X500 (keeps old replies working after a move)' : /^sip$/i.test(prefix) ? 'SIP (Teams)' : rest.length ? prefix : 'Address';
    return [rest.join(':') || text, kindOf];
  });
  root.append(panel(h2('Email addresses'), p('Every address that delivers to this recipient.', 'muted'), aliases.length ? table(['Address', 'Kind'], aliases) : note('No addresses returned.')));
  if (kind === 'm365group' || kind === 'group' || kind === 'publicfolder') {
    // The admin center's group details: Owners, Members, then Settings (delivery management and membership approval).
    if (mailbox.groupError) root.append(callout(mailbox.groupError));
    const memberRows = (value, error, empty) => rowsInto(error || value, ['Display name', 'Email address', 'Recipient type'], m => [objCell(m.name, m.id ? linkKindFor({ type: m.type }) : 'address', { id: m.id, upn: m.address, type: m.type }), m.address, recipientType(m.type).label], empty);
    if (Array.isArray(mailbox.owners) || mailbox.ownersError) root.append(panel(h2('Owners'), memberRows(mailbox.owners, mailbox.ownersError, 'This group has no owner.')));
    if (kind !== 'publicfolder') root.append(panel(h2('Members'), mailbox.type === 'DynamicDistributionGroup' && g?.recipientFilter ? p(`Membership is calculated from this filter: ${g.recipientFilter}`, 'muted') : null, memberRows(mailbox.members, mailbox.membersError, 'This group has no members.')));
    if (g) {
      const settings = [
        ['Who can send to this ' + (kind === 'publicfolder' ? 'folder' : 'group'), g.requireSenderAuth ? 'Only people inside the organization' : 'People inside and outside the organization'],
        ['Only these senders', g.acceptOnlyFrom?.length ? g.acceptOnlyFrom.join(', ') : 'Anyone allowed above'],
      ];
      if (kind === 'm365group') settings.push(['Privacy', g.privacy || DASH], ['Send copies of group conversations to members\' inboxes', g.subscribeNewMembers == null ? DASH : g.subscribeNewMembers ? 'Yes' : 'No']);
      if (g.memberJoin) settings.push(['Joining the group', g.memberJoin], ['Leaving the group', g.memberDepart || DASH]);
      if (g.managedBy?.length) settings.push(['Managed by', g.managedBy.join(', ')]);
      root.append(panel(h2(kind === 'publicfolder' ? 'Delivery management' : 'Settings: delivery management and membership'), table(['Setting', 'Value'], settings)));
    }
  }
  if (isMailbox) root.append(reportSlot(RECIPIENT_REPORT_SECTIONS, { trim: trimRecipientSection }));
  root.append(recipientPortal(kind));
  pageEl.replaceChildren(root);
}
// Like showInto, with the sentence to show when the read worked and returned nothing.
function rowsInto(value, headers, mapRow, empty) {
  const holder = el('div');
  showRows(holder, value, headers, mapRow, empty);
  return holder;
}
function guard(render) {
  const root = el('div', { class: 'stack' });
  root.append(picker());
  if (!mb()) { pageEl.replaceChildren(root, note('Open a recipient to see this page.')); return; }
  const na = notApplicable(currentView());
  if (na) { pageEl.replaceChildren(root, na); return; }
  render(root, mb(), state.box);
  pageEl.replaceChildren(root);
}
// ---- Config review, Recipients, Trace a message, Quarantine, and the full org settings views.
const TAG_CLASS = { high: 'high', medium: 'medium', low: 'low', info: 'info', ok: 'ok' };
function sevTag(severity) { return el('span', { class: `report-tag ${TAG_CLASS[severity] || 'info'}`, text: SEVERITY_LABEL[severity] || severity }); }
function settingsOf() { return state.org?.settings || {}; }
function settingsError(name) { return state.org?.settingsErrors?.[name] || null; }
function rowsOrDenied(name) { return settingsError(name) || settingsOf()[name] || null; }
const DASH = '—';
const yn = v => (v === true || v === 'True' ? 'Yes' : v === false || v === 'False' ? 'No' : '—');
const joined = v => (Array.isArray(v) ? v.filter(Boolean).join(', ') : v == null ? '' : String(v));
function portalDetails(ids) {
  const box = el('details');
  box.append(el('summary', { text: 'Where to change this' }));
  for (const id of ids) {
    const item = portalsFor(id);
    if (!item) continue;
    const links = el('ul', { class: 'portal-list' });
    item.links.forEach((link, i) => links.append(el('li', {}, el('a', { href: link.url, target: '_blank', rel: 'noopener noreferrer', text: `${i === 0 ? 'Open' : 'Also'}: ${link.name}` }))));
    box.append(el('h3', { text: item.title }), links, el('pre', { class: 'report-pre', text: item.powershell }));
  }
  return box;
}
async function recipientsData() {
  if (!state.recipients) state.recipients = await shared(`/api/recipients${demoQuery()}`);
  return state.recipients;
}
function reviewMarkdown(review) {
  const lines = [`# Exchange 360 config review`, '', `Tenant: ${state.org?.tenant || ''}. Source: ${state.demo ? 'Contoso demo data' : 'live, read-only'}. Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC.`, ''];
  for (const a of review.areas) {
    lines.push(`## ${a.title}`, '');
    for (const f of a.findings) lines.push(`- **${SEVERITY_LABEL[f.severity]}**: ${f.title}.${f.why ? ` ${f.why}` : ''}${f.next ? ` Next: ${f.next}` : ''}`);
    lines.push('');
  }
  return lines.join('\n');
}
async function renderReview() {
  const root = el('div', { class: 'stack' });
  pageEl.replaceChildren(root, panel(h2('Reading the tenant'), p(state.demo ? 'Reading the Contoso demo data.' : 'Reading Exchange Online, Purview and Microsoft Graph as you. This takes about a minute. Nothing is changed.')));
  const [compliance, recipients] = await Promise.all([complianceData(), recipientsData()]);
  if (currentView() !== 'review') return;
  pageEl.replaceChildren(root);
  const org = state.org || {};
  if (org.exchangeError) root.append(callout(org.exchangeError.authorized === false ? org.exchangeError : { label: 'Exchange Online', message: org.exchangeError.message || 'Exchange Online did not return data.', authorized: true }));
  const review = reviewTenant({
    settings: org.settings || {}, errors: org.settingsErrors || {}, domains: Array.isArray(org.domains) ? org.domains : [],
    compliance: compliance && !denied(compliance) ? compliance : null,
    recipients: recipients && !recipients.denied ? recipients : null,
    health: org.health, defender: org.defender,
  });
  const c = review.counts;
  const download = el('button', { class: 'btn', type: 'button', text: 'Download as Markdown', onclick: () => {
    const blob = new Blob([reviewMarkdown(review)], { type: 'text/markdown' });
    const a = el('a', { href: URL.createObjectURL(blob), download: `ex360-config-review-${new Date().toISOString().slice(0, 10)}.md`, text: 'review' });
    a.click();
    flash(download, 'Downloaded');
  } });
  root.append(el('div', { class: 'grid grid-3' },
    panel(note('Fix first'), el('div', { class: 'metric', text: String(c.high) })),
    panel(note('Check'), el('div', { class: 'metric', text: String(c.medium) })),
    panel(note('Tidy up, notes and passes'), el('div', { class: 'metric', text: `${c.low} · ${c.info} · ${c.ok}` })),
  ));
  root.append(panel(h2('How to read this'), p(`Each line says what is configured, why it matters, and what to check next. ${state.demo ? 'This is fictional Contoso data.' : 'This was read live with your own permissions. Anything your role cannot read says Not authorized.'} Ex360 changes nothing; every fix is made in the portal under "Where to change this", after your change process.`), el('div', { class: 'row' }, download, el('a', { class: 'btn', href: '#trace', text: 'Trace a message' }), el('a', { class: 'btn', href: '#mb-recipient', text: 'Single recipient' }))));
  const top = review.areas.flatMap(a => a.findings.filter(f => f.severity === 'high').map(f => ({ ...f, area: a.title })));
  if (top.length) root.append(panel(h2('Fix first'), el('ul', { class: 'report-list' }, ...top.map(f => el('li', {}, sevTag('high'), el('span', { text: ` ${f.title}. ${f.next || ''} (${f.area})` }))))));
  for (const a of review.areas) {
    const list = el('ul', { class: 'report-list' });
    for (const f of a.findings) {
      if (f.label) { list.append(el('li', { class: 'plain' }, callout({ label: f.label, message: `${f.title}. ${f.why}${f.next ? ` ${f.next}` : ''}`, authorized: f.label === 'Not authorized' ? false : true }))); continue; }
      list.append(el('li', {}, sevTag(f.severity), el('span', {}, el('strong', { text: ` ${f.title}. ` }), f.why ? `${f.why} ` : '', f.next ? el('em', { text: `Next: ${f.next}` }) : '')));
    }
    root.append(paneWithPortal(el('section', { class: 'panel stack', id: `review-${a.id}` }, h2(a.title), list, portalDetails(a.portals)), a.portals?.[0]));
  }
}

// Organization > Mailboxes and Mail-enabled groups: one page per kind, each a single searchable table
// (search box plus a sort and search menu on every column), laid out like the Exchange admin center list.
// Columns are the Exchange admin center's defaults for the matching list (Recipients > Mailboxes, Resources,
// Groups tabs). Ex360's extra facts (Full Access, booking, members, owners...) open in the row's flyout.
const CA_WORDS = { success: 'Success', failure: 'Failure', notApplied: 'Not Applied' };
function signInStatus(r) {
  if (typeof r.status === 'string') return r.status;
  const code = r.status?.errorCode;
  return code === 0 ? 'Success' : code == null ? DASH : 'Failure';
}
function auditData(r) {
  if (r.AuditData && typeof r.AuditData === 'object') return r.AuditData;
  try { return JSON.parse(r.AuditData || '{}'); } catch { return {}; }
}
const SYNC = g => g.IsDirSynced === true || g.IsDirSynced === 'True' ? 'Synced from on-premises' : 'Not synced';
const RECIPIENT_LISTS = {
  'rcp-shared': { name: 'shared', kind: 'mailbox', search: 'Search shared mailboxes', headers: ['Display name', 'Email address', 'Recipient type', 'Archive status', 'Last modified time'], map: m => [m.DisplayName || m.PrimarySmtpAddress, m.PrimarySmtpAddress, recipientTypeWords(m.RecipientTypeDetails || 'SharedMailbox'), m.ArchiveStatus || 'None', whenCell(m.WhenChanged)], details: m => [['People with Full Access', m.FullAccessCount ?? 'not counted'], ['Direct sign-in', m.AccountEnabled === true ? 'Allowed' : m.AccountEnabled === false ? 'Blocked' : 'Not read'], ['Forwarding address', String(m.ForwardingSmtpAddress || m.ForwardingAddress || '').replace(/^smtp:/i, '') || DASH], ['Copy items sent as this mailbox', yn(m.MessageCopyForSentAsEnabled)]], empty: 'No shared mailboxes.', portal: 'mailboxes', note: 'Full Access is counted for the first 50 shared mailboxes.' },
  'rcp-resources': { name: 'resources', kind: 'resource', search: 'Search rooms and equipment', headers: ['Display name', 'Email address', 'Type'], map: r => [r.DisplayName, r.PrimarySmtpAddress, /Equipment/.test(r.RecipientTypeDetails || '') ? 'Equipment' : 'Room'], details: r => [['Capacity', r.ResourceCapacity ?? DASH], ['Location', r.Office || DASH], ['How booking works', bookingWords(r.Calendar)]], empty: 'No room or equipment mailboxes.', portal: 'resources', note: 'Booking settings are read for the first 100 resources.' },
  'rcp-forwarding': { name: 'forwarding', kind: 'mailbox', search: 'Search mailboxes that forward', headers: ['Display name', 'Email address', 'Recipient type', 'Forwarding address', 'Keep a copy of forwarded email'], map: m => [m.DisplayName || m.PrimarySmtpAddress, m.PrimarySmtpAddress, recipientTypeWords(m.RecipientTypeDetails), String(m.ForwardingSmtpAddress || m.ForwardingAddress || '').replace(/^smtp:/i, ''), yn(m.DeliverToMailboxAndForward)], empty: 'No mailbox forwards. Inbox rules that forward are per mailbox, on Single recipient > Forwarding.', portal: 'forwarding' },
  'rcp-groups': { name: 'groups', kind: 'group', search: 'Search distribution and security groups', // every column the EAC Groups tabs show, with blank cells where a column does not apply
    // to distribution lists or mail-enabled security groups. Group type tells the two tabs apart on one page.
    headers: ['Group name', 'Group email', 'Group type', 'Sync status', 'Teams status', 'Membership type', 'Group privacy', 'Created on'], map: g => [g.DisplayName, g.PrimarySmtpAddress, /security/i.test(g.RecipientTypeDetails || '') ? 'Mail-enabled security' : 'Distribution list', SYNC(g), '', '', '', whenCell(g.WhenCreated)], details: g => [['Members', g.MemberCount ?? 'not counted'], ['Owners', joined(g.ManagedBy) || 'Nobody'], ['Mail from outside the organization', g.RequireSenderAuthenticationEnabled === false ? 'Accepted' : 'Blocked'], ['Message approval', g.ModerationEnabled ? `Yes, by ${joined(g.ModeratedBy) || 'owners'}` : 'No'], ['Joining the group', g.MemberJoinRestriction || DASH]], empty: 'No distribution or mail-enabled security groups.', portal: 'groups', note: 'Members are counted for the first 100 groups.' },
  'rcp-dynamic': { name: 'dynamic', kind: 'dynamicGroup', search: 'Search dynamic distribution groups', headers: ['Group name', 'Group email', 'Sync status', 'Teams status', 'Membership type', 'Group privacy', 'Created on', 'Last refreshed', 'Next scheduled refresh'], map: g => [g.DisplayName, g.PrimarySmtpAddress, SYNC(g), '', '', '', whenCell(g.WhenCreated), '', ''], details: g => [['Who is in it (filter)', g.RecipientFilter || DASH], ['Owners', joined(g.ManagedBy) || 'Nobody'], ['Mail from outside the organization', g.RequireSenderAuthenticationEnabled === false ? 'Accepted' : 'Blocked']], empty: 'No dynamic distribution groups.', portal: 'groups' },
  'rcp-m365': { name: 'm365', kind: 'm365group', search: 'Search Microsoft 365 groups', headers: ['Group name', 'Group email', 'Sync status', 'Teams status', 'Membership type', 'Group privacy', 'Created on'], map: g => [g.DisplayName, g.PrimarySmtpAddress, SYNC(g), /Team/.test(joined(g.ResourceProvisioningOptions) || '') ? 'Team' : 'No team', g.IsMembershipDynamic === true || g.IsMembershipDynamic === 'True' ? 'Dynamic' : 'Assigned', g.AccessType || DASH, whenCell(g.WhenCreated)], details: g => [['Members', g.GroupMemberCount ?? DASH], ['Guests', g.GroupExternalMemberCount ?? DASH], ['Owners', joined(g.ManagedBy) || 'Nobody'], ['Mail from outside the organization', g.RequireSenderAuthenticationEnabled === false ? 'Accepted' : 'Blocked']], empty: 'No Microsoft 365 groups.', portal: 'groups-m365' },
};
// Exchange returns dates as ISO text (PowerShell 7) or /Date(ms)/ (Windows PowerShell). Shown in UTC, sorted by time.
function whenCell(value) {
  if (value == null || value === '') return DASH;
  const ms = /\/Date\((-?\d+)/.exec(String(value))?.[1];
  const iso = ms ? new Date(Number(ms)).toISOString() : value;
  const text = formatUtc(iso);
  return { show: text, text, sort: toTime(iso) };
}
function recipientTypeWords(type) {
  return { UserMailbox: 'User mailbox', SharedMailbox: 'Shared mailbox', RoomMailbox: 'Room mailbox', EquipmentMailbox: 'Equipment mailbox' }[type] || type || DASH;
}
// An empty search result says what this page lists, whether the text is on another list page, and where a user
// mailbox is looked up, so "Nothing matches" never reads like a broken search.
const LIST_WORDS = {
  'rcp-shared': ['shared mailboxes', "A person's own mailbox is a user mailbox, so it is not listed here. Look it up on Single recipient > Recipient."],
  'rcp-resources': ['room and equipment mailboxes', "A person's own mailbox is a user mailbox, so it is not listed here. Look it up on Single recipient > Recipient."],
  'rcp-forwarding': ['mailboxes with a forwarding address', 'A mailbox that does not forward is not listed here. Inbox rules that forward are on Single recipient > Forwarding.'],
  'rcp-groups': ['distribution and mail-enabled security groups', 'A mailbox or a person is not a group. Look it up on Single recipient > Recipient.'],
  'rcp-dynamic': ['dynamic distribution groups', 'A mailbox or a person is not a group. Look it up on Single recipient > Recipient.'],
  'rcp-m365': ['Microsoft 365 groups', 'A mailbox or a person is not a group. Look it up on Single recipient > Recipient.'],
};
function noMatch(id, q, total, data) {
  const [words, hint] = LIST_WORDS[id] || ['recipients of this kind', ''];
  const elsewhere = Object.entries(RECIPIENT_LISTS)
    .filter(([other]) => other !== id).filter(([, other]) => Array.isArray(data[other.name]) && data[other.name].some(r => matchesRecipient(r, q)))
    .map(([other]) => PAGES.find(pg => pg.id === other)).filter(Boolean);
  const box = el('div', { class: 'callout', role: 'status' },
    el('strong', { text: `No ${words} match "${q}".` }),
    p(`This page lists only ${words} (${total} in this tenant), searched by display name and email address.`));
  if (elsewhere.length) box.append(p(`"${q}" is on ${elsewhere.length === 1 ? 'another page' : 'other pages'}:`), el('div', { class: 'row' }, ...elsewhere.map(pg => el('a', { class: 'btn', href: `#${pg.id}`, text: `Open ${pg.title}` }))));
  if (hint) box.append(p(hint), el('div', { class: 'row' }, el('a', { class: 'btn primary', href: id === 'rcp-forwarding' ? '#mb-forward' : '#mb-recipient', text: id === 'rcp-forwarding' ? 'Open Single recipient > Forwarding' : 'Open Single recipient' })));
  return box;
}
// Design rule: recipient and group lists stay empty until a search runs. Search with an empty box
// lists everything; otherwise rows whose name or address contains the text are shown.
function renderRecipientList(id) {
  const spec = RECIPIENT_LISTS[id];
  const input = el('input', { type: 'search', placeholder: 'Name or email address (leave empty to list all)', 'aria-label': spec.search });
  const button = el('button', { class: 'btn primary', type: 'submit', text: 'Search' });
  const form = el('form', { class: 'row' }, el('div', { class: 'grow' }, input), button);
  const out = el('div', { class: 'stack' }, note('Nothing is listed until you search. Type part of a name or address, or leave the box empty, then select Search.'));
  form.addEventListener('submit', event => {
    event.preventDefault();
    busy(button, 'Searching…', async () => {
      out.replaceChildren(el('p', { class: 'loading', text: 'Reading recipients…' }));
      const data = await recipientsData();
      if (data.denied) { out.replaceChildren(callout(data.denied)); return; }
      const err = (data.errors || {})[spec.name];
      if (err) { out.replaceChildren(callout(err)); return; }
      const all = Array.isArray(data[spec.name]) ? data[spec.name] : [];
      const rows = all.filter(r => matchesRecipient(r, input.value));
      if (!all.length) { out.replaceChildren(note(spec.empty)); return; }
      if (!rows.length) { out.replaceChildren(noMatch(id, input.value.trim(), all.length, data)); return; }
      out.replaceChildren(table(spec.headers, rows.map(r => { const cells = spec.map(r); cells[0] = objCell(cells[0], spec.kind, { id: r.ExternalDirectoryObjectId, upn: r.PrimarySmtpAddress, type: r.RecipientTypeDetails }); return cells; }), {
        search: true, searchLabel: spec.search, countLabel: ['recipient', 'recipients'],
        onRowClick: spec.details ? i => openDetails(rows[i].DisplayName || rows[i].PrimarySmtpAddress, table(['Setting', 'Value'], [['Email address', rows[i].PrimarySmtpAddress || DASH], ...spec.details(rows[i])])) : undefined,
      }));
      if (spec.note) out.append(note(spec.note));
    });
  });
  const box = panel(form, out, portalDetails([spec.portal]));
  pageEl.replaceChildren(el('div', { class: 'stack' }, box));
  input.focus();
}

function statusCell(status) {
  const s = explainStatus(status);
  return el('span', {}, el('span', { class: `report-tag ${s.tone}`, text: status || '—' }), ` ${s.words}`);
}
// Trace a message: the Exchange admin center's Message trace. Search, then select a row to open the
// details flyout (Message events and More information, as in the portal) with everything an
// engineer needs about that one message on one screen.
async function safeGet(path) {
  try { return await get(path); } catch (error) { if (error === STALE) throw error; return { ok: false, message: `Ex360 could not reach its own server: ${error.message}` }; }
}
// One line per step: number, time (UTC), time since the previous step, the component that touched the
// item, and what it did. Shared shape from lib/walkthrough.js so other tools can reuse it.
function walkthroughBlock(steps, title) {
  if (!steps.length) return null;
  const copy = el('button', { class: 'btn sm', type: 'button', text: 'Copy as text' });
  copy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(walkText(steps)); copy.textContent = 'Copied'; } catch { copy.textContent = 'Copy failed'; }
    setTimeout(() => { copy.textContent = 'Copy as text'; }, 1500);
  });
  return el('section', { class: 'walk-box stack' },
    el('div', { class: 'spread' }, el('h3', { text: title }), copy),
    el('ol', { class: 'walk' }, ...steps.map(st => el('li', { class: `walk-step ${st.tone || 'info'}` },
      el('span', { class: 'walk-n', text: String(st.n) }),
      el('span', { class: 'walk-time', text: st.clock || '—' }),
      el('span', { class: 'walk-gap', text: st.gap || '' }),
      el('span', { class: 'walk-comp', text: st.component }),
      el('span', { class: 'walk-text', text: st.text })))),
    p('Times are UTC. Each line is one event from Get-MessageTraceDetailV2. The tables below have the full detail.', 'muted'));
}
function traceDetails(row, query) {
  const body = el('div', { class: 'stack' }, note('Reading the message events…'));
  // The portal offers a wider flyout for message trace detail; the events table needs the room.
  openDetails(row.Subject || '(no subject)', body).classList.add('flyout-wide');
  const qs = new URLSearchParams({ recipient: row.RecipientAddress || '', messageTraceId: row.MessageTraceId || '', messageId: row.MessageId || '', related: row.MessageId ? '1' : '', days: query?.days || '10' });
  if (state.demo) qs.set('demo', '1');
  safeGet(`/api/trace?${qs}`).then(data => {
    if (denied(data) || (data.ok === false && !data.commands)) { body.replaceChildren(callout(denied(data) || { label: data.label || 'Message trace detail', message: data.detail || data.message || 'No detail returned.', authorized: true })); return; }
    if (detailMismatch(row.source, data)) { body.replaceChildren(callout({ label: 'Signed out', message: signedOutTrace().message, authorized: true })); return; }
    const detail = (data.commands || []).find(c => c.name === 'detail');
    if (!detail || detail.ok === false) { body.replaceChildren(callout({ label: 'Message trace detail', message: detail?.error || 'Get-MessageTraceDetailV2 did not run. Ex360 needs the recipient and message trace ID from the row.', authorized: !/not authorized|denied/i.test(detail?.error || '') })); return; }
    const events = detail.value || [];
    const verdict = traceVerdict(events);
    const tl = eventTimeline(events);
    const s = explainStatus(row.Status);
    const hits = rulesHit(events);
    const spam = events.map(e => parseSpam(`${e.Detail || ''} ${e.Data || ''}`)).find(Boolean);
    const related = traceOutcome({ commands: (data.commands || []).filter(c => c.name === 'trace') });
    const relatedRows = related.kind === 'rows' ? related.rows.map(r => ({ ...r, source: data.source })) : [];
    const nexts = [s.next, ...verdict.events.map(e => e.next)].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
    const links = el('div', { class: 'row' });
    if (/quarantin/i.test(row.Status) || verdict.events.some(e => /quarantin/i.test(e.detail))) links.append(el('a', { class: 'btn primary', href: '#quarantine', text: 'Open Quarantine', onclick: () => { state.quarantineQuery = { recipient: row.RecipientAddress }; } }));
    if (verdict.events.some(e => e.code)) links.append(el('a', { class: 'btn', href: '#playbooks', text: 'Look up the NDR code' }));
    links.append(el('a', { class: 'btn', href: '#hops', text: 'Analyze the headers' }));
    const eac = portalsFor('message-trace')?.links?.[0];
    if (eac) links.append(el('a', { class: 'btn', href: eac.url, target: '_blank', rel: 'noopener noreferrer', text: 'Open Message trace in the Exchange admin center' }));
    const timeline = tl.steps.map(e => [
      { show: formatUtc(e.date), text: formatUtc(e.date), sort: toTime(e.date) },
      { show: el('span', { class: `report-tag ${e.tone}`, text: e.name || '—' }), text: e.name },
      e.action || DASH,
      e.detail || DASH,
      e.gap ? { show: e.gap, text: e.gap, sort: e.gapMs } : DASH,
      `${e.words}${e.rule ? ` (${e.rule})` : ''}`,
    ]);
    body.replaceChildren(...[
      el('div', { class: 'row' }, el('span', { class: `report-tag ${s.tone}`, text: row.Status || 'No status' }), el('span', { text: s.words })),
      p(`${row.SenderAddress || '(no sender)'} to ${row.RecipientAddress || '(no recipient)'}, received ${formatUtc(row.Received)} UTC.`),
      walkthroughBlock(traceWalkthroughSteps(row, events), 'What happened, step by step'),
      el('div', { class: 'callout' }, el('strong', { text: 'In plain words' }), p(`${verdict.text}${tl.total ? ` It spent ${tl.total} inside Exchange Online.` : ''}${tl.slowest ? ` The longest wait was ${tl.slowest.gap} before the ${tl.slowest.name} event.` : ''}`)),
      el('h3', { text: 'Message events' }),
      events.length ? table(['Date', 'Event', 'Action', 'Detail', 'Time from previous event', 'What it means'], timeline, { countLabel: ['event', 'events'] }) : note('No events yet. Message trace can lag 5 to 10 minutes.'),
      hits.length ? el('h3', { text: 'Mail flow rules and DLP policies that acted on it' }) : null,
      hits.length ? table(['Type', 'Name', 'Action taken', 'ID', ''], hits.map(h => [h.kind, h.rule ? `${h.name} (rule: ${h.rule})` : h.name || DASH, h.action || DASH, h.id || DASH, h.kind === 'Mail flow rule' && h.name ? { show: el('a', { class: 'btn sm', href: `#rules?rule=${encodeURIComponent(h.name)}`, text: 'Open this rule' }), text: '' } : h.kind === 'DLP policy' ? { show: el('a', { class: 'btn sm', href: '#dlp', text: 'Open DLP' }), text: '' } : ''])) : null,
      spam ? el('h3', { text: 'Spam filter verdict' }) : null,
      spam ? table(['Field', 'Value'], [['Spam confidence level (SCL)', spam.scl || DASH], ['Spam filter verdict (SFV)', spam.sfv || DASH], ['Category (CAT)', spam.cat || DASH], ['Sending country', spam.country || DASH]]) : null,
      el('h3', { text: 'More information' }),
      table(['Field', 'Value'], messageFacts(row, events)),
      el('h3', { text: `Related records (same Message ID): ${relatedRows.length}` }),
      relatedRows.length ? table(['Date (UTC)', 'Recipient', 'Status', ''], relatedRows.map(r => [formatUtc(r.Received), r.RecipientAddress, { show: statusCell(r.Status), text: r.Status }, r.MessageTraceId === row.MessageTraceId && r.RecipientAddress === row.RecipientAddress ? 'This record' : { show: el('button', { class: 'btn sm', type: 'button', text: 'Open', onclick: () => traceDetails(r, query) }), text: '' }]), { countLabel: ['record', 'records'] }) : note(related.kind === 'error' ? `Related records were not read: ${related.message}` : 'Only this record.'),
      nexts.length ? el('h3', { text: 'What to check next' }) : null,
      nexts.length ? steps(nexts) : null,
      links,
      el('h3', { text: 'The same in PowerShell' }),
      el('pre', { class: 'report-pre', text: [detailCommand(row), row.MessageId ? relatedCommand(row, query?.days || 10) : ''].filter(Boolean).join('\n\n') }),
    ].filter(Boolean));
  });
}
async function renderTrace() {
  const root = el('div', { class: 'stack' });
  const q = queryFromHash(location.hash);
  // A link that names an address or message ID (for example from Single recipient > Recipient) wins over the last search.
  const fromLink = Boolean(q.sender || q.recipient || q.messageId);
  const last = fromLink ? { sender: q.sender || '', recipient: q.recipient || '', messageId: q.messageId || '', days: ['1', '2', '7', '10'].includes(q.days) ? q.days : '2' } : state.traceQuery || {};
  const field = (name, label, value, placeholder) => el('label', { class: 'stack' }, el('span', { text: label }), el('input', { name, value: value || '', placeholder: placeholder || '', autocomplete: 'off', spellcheck: 'false' }));
  const days = el('select', { name: 'days' }, ...[['1', 'Last 24 hours'], ['2', 'Last 2 days'], ['7', 'Last 7 days'], ['10', 'Last 10 days']].map(([v, t]) => el('option', { value: v, text: t })));
  days.value = last.days || '2';
  const status = el('select', { name: 'status' }, ...[['', 'All'], ['Delivered', 'Delivered'], ['Expanded', 'Expanded'], ['Failed', 'Failed'], ['Pending', 'Pending'], ['Quarantined', 'Quarantined'], ['FilteredAsSpam', 'Filtered as spam'], ['GettingStatus', 'Getting status']].map(([v, t]) => el('option', { value: v, text: t })));
  status.value = last.status || '';
  const subjectFilter = el('select', { name: 'subjectFilter' }, ...[['StartsWith', 'starts with'], ['Contains', 'contains'], ['EndsWith', 'ends with']].map(([v, t]) => el('option', { value: v, text: t })));
  subjectFilter.value = last.subjectFilter || 'StartsWith';
  const form = el('form', { class: 'stack' },
    el('div', { class: 'grid grid-3' }, field('sender', 'Senders', last.sender ?? q.sender, 'someone@example.com'), field('recipient', 'Recipients', last.recipient ?? q.recipient, 'user@yourdomain.com'), field('messageId', 'Message ID (with angle brackets)', last.messageId ?? q.messageId, '<id@server>')),
    el('div', { class: 'row' }, el('label', { class: 'stack' }, el('span', { text: 'Subject' }), subjectFilter), el('label', { class: 'stack grow' }, el('span', { text: 'Subject text' }), el('input', { name: 'subject', value: last.subject || '', placeholder: 'Part of the subject line', autocomplete: 'off' }))),
    el('div', { class: 'row' }, el('label', { class: 'stack' }, el('span', { text: 'Time range' }), days), el('label', { class: 'stack' }, el('span', { text: 'Delivery status' }), status), el('button', { class: 'btn primary', type: 'submit', text: 'Search message trace' })),
    note('Fill in at least one of senders, recipients, message ID or subject. Senders and recipients must be the full address (Get-MessageTraceV2 has no wildcards). The sender is the envelope sender (MAIL FROM), which can differ from the From line the user sees. Message trace keeps 90 days, one search covers up to 10 days, and results can lag 5 to 10 minutes. Select a message to see its events.'));
  const out = el('div', { class: 'stack' });
  const run = async data => {
    if (!data.sender && !data.recipient && !data.messageId && !data.subject) { out.replaceChildren(callout({ label: 'Search', message: 'Enter a sender, a recipient, a message ID or a subject.', authorized: true })); return; }
    state.traceQuery = data;
    await busy(form.querySelector('button[type="submit"]'), 'Searching…', async () => {
      out.replaceChildren(note(state.demo ? 'Searching the Contoso demo messages…' : 'Running Get-MessageTraceV2 in Exchange Online…'));
      const qs = new URLSearchParams(data);
      if (state.demo) qs.set('demo', '1');
      state.traceResult = await safeGet(`/api/trace?${qs}`);
    });
    showResults();
    refreshPortal();
  };
  form.addEventListener('submit', event => { event.preventDefault(); run(Object.fromEntries([...new FormData(form).entries()].map(([k, v]) => [k, String(v).trim()]))); });
  const ranBlock = (data, label) => {
    const query = data.query || {};
    const win = data.window ? ` Window: ${formatUtc(data.window.start)} to ${formatUtc(data.window.end)} UTC.` : '';
    const who = data.source === 'demo' ? ' Demo data (fictional Contoso), not your tenant.' : query.account ? ` Run as ${query.account}.` : '';
    return el('div', { class: 'stack' }, el('h3', { text: label }), p(`${who}${win}`.trim() || 'The command Ex360 ran:', 'muted'), el('pre', { class: 'report-pre', text: query.command || traceCommand(state.traceQuery || {}) }));
  };
  const showResults = () => {
    const data = state.traceResult;
    if (!data) { out.replaceChildren(); return; }
    const result = traceOutcome(data);
    if (result.kind === 'denied') { out.replaceChildren(callout(denied(result.value) || result.value)); return; }
    if (result.kind === 'error') { out.replaceChildren(panel(callout({ label: 'Message trace failed', message: result.message, authorized: true }), p('This is an error, not an empty result. Nothing below means "no messages".', 'muted'), ranBlock(data, 'The command that failed'))); return; }
    if (result.kind === 'empty') {
      const cur = state.traceQuery || {};
      const tries = el('div', { class: 'row' });
      if (cur.sender && !cur.recipient) tries.append(el('button', { class: 'btn', type: 'button', text: 'Search this address as the recipient', onclick: e => busy(e.currentTarget, 'Searching…', () => run({ ...cur, recipient: cur.sender, sender: '' })) }));
      if (cur.recipient && !cur.sender) tries.append(el('button', { class: 'btn', type: 'button', text: 'Search this address as the sender', onclick: e => busy(e.currentTarget, 'Searching…', () => run({ ...cur, sender: cur.recipient, recipient: '' })) }));
      if (String(cur.days) !== '10') tries.append(el('button', { class: 'btn', type: 'button', text: 'Search the last 10 days', onclick: e => busy(e.currentTarget, 'Searching…', () => run({ ...cur, days: '10' })) }));
      if (cur.status) tries.append(el('button', { class: 'btn', type: 'button', text: 'Search all delivery statuses', onclick: e => busy(e.currentTarget, 'Searching…', () => run({ ...cur, status: '' })) }));
      const demo = data.source === 'demo' || state.demo;
      out.replaceChildren(panel(h2('No messages matched'),
        demo ? el('div', { class: 'callout warn', role: 'status' }, el('strong', { text: 'Demo mode: your tenant was not searched' }), p('This searched the fictional Contoso sample, which has none of your mail. Select Sign in in the left pane, wait for LIVE at the top, then search again.')) : null,
        demo ? null : p('Get-MessageTraceV2 ran and answered with zero records. Common reasons: the envelope sender (MAIL FROM) is not the From address you see, for example mail sent through a hosting provider or a mailing service uses its own bounce address; the address has a typo; or the message is older than the time range. If you know part of the subject, search by subject instead.'),
        !demo && tries.childNodes.length ? tries : null,
        ranBlock(data, 'Paste this into Exchange Online PowerShell to compare')));
      return;
    }
    const rows = result.rows.map(r => ({ ...r, source: data.source || (state.demo ? 'demo' : 'live') }));
    const wrap = table(['Date', 'Sender', 'Recipient', 'Subject', 'Status'], rows.map(r => [{ show: formatUtc(r.Received), text: formatUtc(r.Received), sort: toTime(r.Received) }, r.SenderAddress || DASH, r.RecipientAddress || DASH, xc('message', r.Subject || '(no subject)'), { show: statusCell(r.Status), text: r.Status || '' }]), { onRowClick: i => traceDetails(rows[i], state.traceQuery), rowLabel: i => `Open details for ${rows[i].Subject || 'the message'} to ${rows[i].RecipientAddress}`, search: true, searchLabel: 'Search results', countLabel: ['message', 'messages'] });
    out.replaceChildren(panel(h2(`Message trace search results: ${rows.length}`), p('Newest first, like the portal. Dates are in UTC. Select a message to open its details.', 'muted'), wrap, rows.length >= 200 ? note('Showing the first 200. Narrow the search to see the rest.') : null, ranBlock(data, 'The command Ex360 ran')));
  };
  let portalBox = portals('message-trace', state.traceQuery ? traceCommand(state.traceQuery) : '');
  const refreshPortal = () => { const next = portals('message-trace', state.traceQuery ? traceCommand(state.traceQuery) : ''); portalBox.replaceWith(next); portalBox = next; };
  root.append(panel(h2('Search'), form), out, portalBox);
  pageEl.replaceChildren(root);
  if (fromLink && q.run === '1' && !(state.traceQuery && state.traceQuery.sender === last.sender && state.traceQuery.recipient === last.recipient && state.traceQuery.messageId === last.messageId && String(state.traceQuery.days) === last.days)) form.requestSubmit();
  else showResults();
}

async function renderQuarantine() {
  const root = el('div', { class: 'stack' });
  const qq = state.quarantineQuery || {};
  const recipient = el('input', { name: 'recipient', value: qq.recipient || '', placeholder: 'Recipient (optional)' });
  const sender = el('input', { name: 'sender', value: qq.sender || '', placeholder: 'Sender (optional)' });
  const days = el('select', { name: 'days' }, ...[['3', 'Last 3 days'], ['14', 'Last 14 days'], ['30', 'Last 30 days']].map(([v, t]) => el('option', { value: v, text: t })));
  days.value = qq.days || '14';
  const form = el('form', { class: 'row' }, recipient, sender, days, el('button', { class: 'btn primary', type: 'submit', text: 'Read quarantine' }));
  const out = el('div', { class: 'stack' });
  const load = () => busy(form.querySelector('button[type="submit"]'), 'Reading quarantine…', async () => {
    out.replaceChildren(note('Reading quarantine…'));
    const qs = new URLSearchParams({ recipient: recipient.value, sender: sender.value, days: days.value });
    if (state.demo) qs.set('demo', '1');
    state.quarantineQuery = Object.fromEntries(qs.entries());
    const data = await get(`/api/quarantine?${qs}`);
    if (denied(data) || (data.ok === false && !data.commands)) { out.replaceChildren(callout(denied(data) || { label: 'Quarantine', message: data.message || '', authorized: true })); return; }
    const cmd = (data.commands || []).find(c => c.name === 'messages');
    if (cmd && cmd.ok === false) { out.replaceChildren(callout({ label: /not authorized|denied/i.test(cmd.error || '') ? 'Not authorized' : 'Quarantine', message: `${cmd.error || ''} Reading quarantine needs Security Reader, Quarantine Administrator or Security Administrator.`, authorized: !/not authorized|denied/i.test(cmd.error || '') })); return; }
    const rows = cmd?.value || [];
    const summary = quarantineSummary(rows);
    out.replaceChildren(
      panel(h2(`${rows.length} quarantined message${rows.length === 1 ? '' : 's'}`), summary.length ? p(summary.map(([k, n]) => `${k}: ${n}`).join(' · ')) : note('Nothing in quarantine for this search.')),
      // Defender portal > Quarantine > Email: the default columns, in the portal's order. Ex360's plain-words
      // explanation (who can release it, which policy) opens in the flyout when a row is selected.
      rows.length ? panel(table(['Time received', 'Subject', 'Sender', 'Quarantine reason', 'Release status', 'Policy type', 'Expires', 'Recipient', 'Sender address override reason', 'Released by'], rows.map(r => [
        r.ReceivedTime ? { show: formatUtc(r.ReceivedTime), text: formatUtc(r.ReceivedTime), sort: toTime(r.ReceivedTime) } : DASH,
        xc('quarantineMessage', r.Subject || '(no subject)'), r.SenderAddress || DASH, r.QuarantineTypes || r.Type || DASH, r.ReleaseStatus || DASH, r.PolicyType || DASH,
        r.Expires ? { show: formatUtc(r.Expires), text: formatUtc(r.Expires), sort: toTime(r.Expires) } : DASH,
        joined(r.RecipientAddress) || DASH, r.OverrideReason || 'None', joined(r.ReleasedUser) || DASH]), {
        onRowClick: i => { const r = rows[i]; const x = explainQuarantine(r); openDetails(r.Subject || '(no subject)', table(['Field', 'Value'], [['Why it was held', x.reason], ['Policy', x.policy || DASH], ['Who can release it', x.release], ['Policy name', r.PolicyName || DASH], ['Mail direction', r.Direction || DASH], ['Message ID', r.MessageId || DASH]])); },
        rowLabel: i => `Open details for ${rows[i].Subject || 'the message'}`, countLabel: ['message', 'messages'] })) : null,
      note('Ex360 only reads. Release, preview, delete and "report as not junk" are done in the Defender portal by someone with a quarantine role.'),
    );
  });
  form.addEventListener('submit', event => { event.preventDefault(); load(); });
  root.append(panel(h2('Search quarantine'), form), out, portals('quarantine-messages'), portals('quarantine'));
  pageEl.replaceChildren(root);
  load();
}

function policyTable(kind, policyRows, ruleRows, policyKey) {
  const holder = el('div', { class: 'stack' });
  const denyP = denied(policyRows);
  if (denyP) { holder.append(callout(denyP)); return holder; }
  const policies = Array.isArray(policyRows) ? policyRows : [];
  const rules = Array.isArray(ruleRows) ? ruleRows : [];
  if (!policies.length) { holder.append(note('No policies returned.')); return holder; }
  const rows = [];
  for (const pol of policies) {
    const rule = rules.find(r => r[policyKey] === pol.Name);
    const kindText = pol.RecommendedPolicyType ? `${pol.RecommendedPolicyType} preset` : pol.IsBuiltInProtection ? 'Built-in protection (everyone not in another policy)' : pol.IsDefault ? 'Default (everyone not in another policy)' : 'Custom';
    const scope = rule ? [rule.State && rule.State !== 'Enabled' ? `Rule ${rule.State}.` : '', `Priority ${rule.Priority ?? '—'}.`, joined(rule.SentTo) && `Users: ${joined(rule.SentTo)}.`, joined(rule.SentToMemberOf) && `Groups: ${joined(rule.SentToMemberOf)}.`, joined(rule.RecipientDomainIs) && `Domains: ${joined(rule.RecipientDomainIs)}.`, (joined(rule.ExceptIfSentTo) || joined(rule.ExceptIfSentToMemberOf)) && `Except: ${[joined(rule.ExceptIfSentTo), joined(rule.ExceptIfSentToMemberOf)].filter(Boolean).join(', ')}.`].filter(Boolean).join(' ') : (pol.IsDefault || pol.IsBuiltInProtection ? 'Applies to everyone not covered by another policy.' : pol.RecommendedPolicyType ? 'Scoped by the preset policy rule.' : 'No rule found, so this policy applies to nobody.');
    const words = settingsWords(kind, pol);
    // Defender portal policy lists show Name, Status, Priority and Type; the settings open in the flyout.
    const always = pol.IsDefault || pol.IsBuiltInProtection;
    const status = always ? 'Always on' : rule ? (rule.State && rule.State !== 'Enabled' ? 'Off' : 'On') : pol.RecommendedPolicyType ? 'On' : 'Off';
    const priority = always ? 'Lowest' : rule?.Priority ?? (pol.RecommendedPolicyType === 'Strict' ? 'Highest' : pol.RecommendedPolicyType ? 'High' : DASH);
    const type = pol.RecommendedPolicyType ? `${pol.RecommendedPolicyType} preset security policy` : pol.IsBuiltInProtection ? 'Built-in protection' : pol.IsDefault ? 'Default policy' : 'Custom policy';
    rows.push({ pol, kindText, scope, words, cells: [xc(kind, pol.Name), status, { show: String(priority), text: String(priority), sort: typeof priority === 'number' ? priority : priority === 'Highest' ? -2 : priority === 'High' ? -1 : 9999 }, type] });
  }
  holder.append(table(['Name', 'Status', 'Priority', 'Type'], rows.map(r => r.cells), { onRowClick: i => {
    const r = rows[i];
    openDetails(r.pol.Name, p(r.kindText), p(r.scope), r.words.length ? el('ul', { class: 'plain' }, ...r.words.map(w => el('li', { text: w }))) : note('No settings to explain.'));
  }, rowLabel: i => `Open details for ${rows[i].pol.Name}`, countLabel: ['policy', 'policies'] }));
  return holder;
}

const views = {
  setup: renderSetup,
  start: renderStart,
  needs: renderNeeds,
  asked: renderAsked,
  glossary: renderGlossary,
  learn: renderLearn,
  playbooks: renderPlaybooks,
  review: renderReview,
  ...Object.fromEntries(Object.keys(RECIPIENT_LISTS).map(id => [id, () => renderRecipientList(id)])),
  trace: renderTrace,
  nexthop: () => renderNextHop({ el, panel, h2, p, note, table, busy, flash, objCell, pageEl, steps, session: state.session }),
  quarantine: renderQuarantine,
  licenses: renderLicenses,
  domains: renderDomains,
  connectors: renderConnectors,
  rules: renderRules,
  security: renderSecurity,
  'sec-antispam': () => renderSecurityArea('sec-antispam'),
  'sec-antiphish': () => renderSecurityArea('sec-antiphish'),
  'sec-antimalware': () => renderSecurityArea('sec-antimalware'),
  'sec-safelinks': () => renderSecurityArea('sec-safelinks'),
  'sec-safeattach': () => renderSecurityArea('sec-safeattach'),
  'sec-outbound': () => renderSecurityArea('sec-outbound'),
  'sec-connection': () => renderSecurityArea('sec-connection'),
  'sec-quarantine': () => renderSecurityArea('sec-quarantine'),
  config: renderConfig,
  health: renderHealth,
  onprem: renderOnprem,
  migrations: renderMigrations,
  'admin-roles': renderAdminRoles,
  'user-roles': renderUserRoles,
  'role-assignments': renderRoleAssignments,
  'app-rbac': renderAppRbac,
  changes: renderChanges,
  dlp: renderDlp,
  labels: renderLabels,
  'retention-cc': renderRetention,
  ediscovery: renderEdiscovery,
  audit: renderAudit,
  'compliance-admin': renderComplianceAdmin,
  'mb-compliance': renderMbCompliance,
  'mb-ca': renderMbCa,
  'mb-xdr': renderMbXdr,
  'mb-recipient': renderRecipient,
  'mb-forward': () => guard((root, mailbox) => {
    root.append(panel(h2('Mailbox forwarding'), table(['Forward to', 'Also keep a copy'], [[mailbox.forwarding?.smtp || 'Not set', mailbox.forwarding?.deliverAndForward ? 'Yes' : 'No']])));
    showRows(root, mailbox.inboxError || mailbox.inboxRules, ['Rule', 'Enabled', 'What it does'], r => [xc('inboxRule', r.name), r.enabled ? 'Yes' : 'No', r.description], 'This mailbox has no inbox rules.');
    root.append(portals('forwarding'));
  }),
  'mb-rules': () => guard((root, mailbox) => {
    showRows(root, mailbox.inboxError || mailbox.inboxRules, ['Rule', 'Enabled', 'What it does'], r => [xc('inboxRule', r.name), r.enabled ? 'Yes' : 'No', r.description], 'This mailbox has no inbox rules.');
    // The mailbox Junk Email settings, from the full mailbox read (the rules table above is not repeated).
    root.append(reportSlot(['rules'], { trim: sec => ({ ...sec, title: 'Junk email settings', intro: 'The Junk Email settings inside this mailbox.', blocks: sec.blocks.filter(b => b.type === 'facts' || (b.type === 'denied' && /junk/i.test(b.message || ''))) }) }));
    root.append(portals('forwarding'));
  }),
  'mb-delegation': () => guard((root, mailbox) => {
    // Each section shows its own failed read. "Nobody" is only said when the read worked and came back empty.
    const who = mailbox.primary || 'this mailbox';
    const granted = mailbox.granted || {};
    const rights = r => (Array.isArray(r.rights) ? r.rights : r.rights ? [r.rights] : []).join(', ') || 'FullAccess';
    if (recipientKind() !== 'mailbox') {
      // Groups and mail users: Send As and Send on Behalf only. Nobody "opens" a group or a mail user.
      root.append(note(`A ${KIND_WORDS[recipientKind()]} has no Full Access permission: ${recipientKind() === 'm365group' ? 'members read the group mailbox because they are members' : 'there is no mailbox here to open'}.`));
      root.append(panel(h2('Send As'), rowsInto(mailbox.sendAsError || mailbox.sendAs, ['Name'], r => [objCell(r.name, 'address', { address: r.address || r.name })], `Nobody can send as ${who}.`)));
      root.append(panel(h2('Send on Behalf'), rowsInto(mailbox.sendOnBehalfError || mailbox.sendOnBehalf, ['Name'], r => [objCell(r.name || r, 'address', { address: r.address || r.name || r })], `Nobody can send on behalf of ${who}.`)));
      root.append(portals(recipientKind() === 'mailuser' ? 'delegation' : recipientKind() === 'm365group' ? 'groups-m365' : 'groups'));
      return;
    }
    root.append(panel(h2('Who can open this mailbox (Full Access)'), rowsInto(mailbox.fullError || mailbox.fullAccess, ['Name', 'Rights'], r => [objCell(r.name, 'address', { address: r.address || r.name }), rights(r)], `Nobody else has Full Access to ${who}.`)));
    root.append(panel(h2('Send As'), rowsInto(mailbox.sendAsError || mailbox.sendAs, ['Name'], r => [objCell(r.name, 'address', { address: r.address || r.name })], `Nobody else can send as ${who}.`)));
    root.append(panel(h2('Send on Behalf'), rowsInto(mailbox.sendOnBehalfError || mailbox.sendOnBehalf, ['Name'], r => [objCell(r.name || r, 'address', { address: r.address || r.name || r })], `Nobody can send on behalf of ${who}.`)));
    root.append(panel(h2('Mailboxes this person can open (Full Access)'), rowsInto(granted.fullAccessError || granted.fullAccess, ['Mailbox', 'Address', 'Rights'], r => [objCell(r.name, 'address', { address: r.address || r.name }), r.address || '', rights(r)], `${who} has Full Access to no other mailbox.`), state.demo ? null : note('Exchange has no reverse lookup for Full Access, so Ex360 checks the first 500 mailboxes one by one.')));
    root.append(panel(h2('Mailboxes this person can send as'), rowsInto(granted.sendAsError || granted.sendAs, ['Mailbox'], r => [objCell(r.name, 'address', { address: r.address || r.name })], `${who} can send as no other mailbox.`)));
    root.append(panel(h2('Mailboxes this person can send on behalf of'), rowsInto(granted.sendOnBehalfError || granted.sendOnBehalf, ['Mailbox', 'Address'], r => [objCell(r.name, 'address', { address: r.address || r.name }), r.address || ''], `${who} can send on behalf of no other mailbox.`)));
    root.append(portals('delegation'));
  }),
  'mb-groups': () => guard((root, mailbox) => {
    showRows(root, mailbox.memberError || mailbox.memberOf, ['Group'], g => [objCell(g.name || g.id, g.kind === 'm365' ? 'm365group' : 'group', { id: g.id, type: g.kind })], 'This recipient is not a member of any group.');
    root.append(portals('groups'));
  }),
  'mb-policies': () => guard((root, mailbox, box) => {
    // Live mailboxes: the full mailbox read matches the live mail flow rules, protection policies and connectors.
    if (!state.demo && recipientKind() === 'mailbox') {
      root.append(reportSlot(['transport', 'protection', 'connectors']));
      root.append(panel(h2('Holds'), table(['Flag', 'On'], [['Litigation hold', mailbox.litigationHold ? 'Yes' : 'No'], ['Retention hold', mailbox.retentionHold ? 'Yes' : 'No'], ['Retention policy', mailbox.retentionPolicy || '']])));
      return;
    }
    if (!state.demo) root.append(el('div', { class: 'callout warn' }, el('strong', { text: 'Organization defaults only' }), p(`Ex360 matches live policies to mailboxes. For a ${KIND_WORDS[recipientKind()] || 'recipient'} this page shows the defaults; the mail flow rules that name it are on Mail flow rules.`), el('a', { class: 'btn primary', href: '#rules', text: 'Open Mail flow rules' })));
    const policies = box.policies || {};
    if (policies.preset) root.append(el('div', { class: 'callout' }, el('strong', { text: policies.preset.name }), p(policies.preset.why)));
    const rows = Object.values(policies.policies || {});
    root.append(panel(h2('Security policies'), table(['Kind', 'Applies', 'Why'], rows.map(r => [r.kind, r.applies || r.license || '', r.why]))));
    root.append(panel(h2('Quarantine'), p(policies.quarantine?.why || '')));
    root.append(panel(h2('Transport rules, in priority order'), table(['Priority', 'Rule', 'Applies', 'Why'], (box.rules || []).map(r => [r.priority, xc('transportRule', r.name), r.applies ? 'Yes' : 'No', r.why]))));
    root.append(panel(h2('Connectors'), table(['Connector', 'Applies', 'Why'], (box.connectors || []).map(c => [xc('connector', c.name), c.applies ? 'Yes' : 'No', c.why]))));
    root.append(panel(h2('Holds'), table(['Flag', 'On'], [['Litigation hold', mailbox.litigationHold ? 'Yes' : 'No'], ['Retention hold', mailbox.retentionHold ? 'Yes' : 'No'], ['Retention policy', mailbox.retentionPolicy || '']])));
    root.append(portals('anti-spam'), portals('transport-rules'), portals('retention'));
  }),
  'mb-protocols': () => guard((root, mailbox) => {
    if (mailbox.casError) root.append(callout(mailbox.casError));
    if (mailbox.exchange) root.append(callout(mailbox.exchange));
    root.append(panel(h2('Client protocols'), table(['Protocol', 'Enabled'], (state.box.protocols || []).map(r => [r.name, r.enabled ? 'Yes' : 'No']))));
    const auth = authPolicyWords({ user: mailbox.authPolicy, userError: mailbox.authPolicyError, orgDefault: state.demo ? (mailbox.authPolicy ? null : '') : mailbox.orgAuthPolicy, orgError: mailbox.orgAuthPolicyError });
    root.append(panel(h2('Authentication policy'), table(['Applies', 'Why'], [[auth.label, auth.text]])));
    root.append(portals('auth-policies'));
  }),
  'mb-signins': async () => {
    const root = el('div', { class: 'stack' });
    root.append(picker());
    const na = mb() ? notApplicable('mb-signins') : null;
    if (na) root.append(na);
    else if (mb()) {
      // Logs wait for a search: nothing is read until Read sign-ins is selected.
      if (!state.signins) {
        const read = el('button', { class: 'btn primary', type: 'button', text: 'Read sign-ins' });
        read.addEventListener('click', () => busy(read, 'Reading sign-ins…', async () => {
          state.signins = await get(`/api/signins?id=${encodeURIComponent(mb().id)}&upn=${encodeURIComponent(mb().primary)}${demoAnd()}`);
        }).then(() => render()));
        root.append(panel(h2('Sign-ins'), note(`Sign-ins for ${mb().displayName} are not read until you ask.`), el('div', { class: 'row' }, read)));
        pageEl.replaceChildren(root);
        return;
      }
      if (denied(state.signins)) root.append(callout(state.signins));
      else {
        // The last 10 by default; Show all lists every sign-in Ex360 read (up to 50).
        const all = state.signins.value || [];
        const holder = el('div', { class: 'stack' });
        const draw = showAll => {
          const shown = showAll ? all : all.slice(0, SIGNINS_SHOWN);
          holder.replaceChildren();
          // Microsoft Entra admin center > Sign-in logs default columns.
          showRows(holder, shown, ['Date', 'Request ID', 'User principal name', 'Application', 'Status', 'IP address', 'Resource', 'Resource ID', 'Conditional access', 'User'], r => [objCell(formatUtc(r.time || r.createdDateTime), 'signIn', { id: r.id }), r.id || DASH, r.userPrincipalName || r.user || DASH, r.app || r.appDisplayName || DASH, signInStatus(r), r.ip || r.ipAddress || DASH, r.resourceDisplayName || DASH, r.resourceId || DASH, CA_WORDS[r.conditionalAccessStatus] || r.conditionalAccessStatus || DASH, r.userDisplayName || DASH], 'No sign-ins in this window.', r => [['Location', [r.location?.city, r.location?.state, r.location?.countryOrRegion].filter(Boolean).join(', ') || r.locationText || '']]);
          if (all.length > SIGNINS_SHOWN) {
            const more = el('button', { class: 'btn', type: 'button', text: showAll ? `Show the last ${SIGNINS_SHOWN} only` : `Show all ${all.length}` });
            more.addEventListener('click', () => draw(!showAll));
            holder.append(note(showAll ? `Showing all ${all.length} sign-ins Ex360 read, newest first.` : `Showing the last ${SIGNINS_SHOWN} of ${all.length}, newest first.`), el('div', { class: 'row' }, more));
          }
        };
        draw(false);
        root.append(holder);
      }
    }
    pageEl.replaceChildren(root);
  },
  'mb-findings': () => guard((root, mailbox, box) => {
    root.append(panel(h2('Findings'),
      note('Findings are settings on this recipient that are worth a second look, ranked high, medium, low or info. Ex360 works them out from what it already read, as you; nothing is changed.'),
      note('Source: Exchange Online PowerShell. Forwarding and holds come from Get-Mailbox, forwarding inbox rules from Get-InboxRule, POP and authenticated SMTP from Get-CASMailbox, disabled transport rules that would match from Get-TransportRule, and Safe Links licensing from Get-SafeLinksPolicy with Microsoft Graph subscribed SKUs. For a group: Get-DistributionGroup or Get-UnifiedGroup, its owners and members.'),
      table(['Severity', 'Finding', 'Detail'], (box.findings || []).map(f => [f.severity, f.title, f.detail]))));
    // For a mailbox, the full read's At a glance list: everything worth a look, most important first.
    root.append(reportSlot(['glance'], { waiting: state.demo ? 'Reading the Contoso demo data for At a glance.' : 'Reading the full mailbox for the At a glance list (Microsoft Graph user, groups and sign-ins, Exchange Online and Purview, as you). This usually takes about a minute. Nothing is changed.' }));
  }),
  hops: renderHops,
  outlook: renderOutlook,
};

function renderHops() {
  const root = el('div', { class: 'stack' });
  const area = el('textarea', { placeholder: 'Paste message headers here' });
  const out = el('div', { class: 'stack' });
  const show = analysis => {
    state.analysis = analysis;
    const summary = analysis.summary || {};
    out.replaceChildren(
      panel(h2('In plain words'), el('ul', { class: 'plain' }, ...(analysis.plainLanguage || []).map(line => el('li', { text: line })))),
      panel(h2('Hops, oldest first'), el('div', { class: 'stack' }, ...(analysis.hops || []).map(hop => el('div', { class: 'hop' }, el('i', { text: String(hop.index) }), el('div', {}, el('strong', { text: `${hop.kind} · ${hop.by || 'unknown server'}` }), p(`${hop.date || ''} ${hop.tls ? `TLS ${hop.tls}` : 'no TLS advertised'} ${hop.delayMs != null ? `· ${Math.round(hop.delayMs / 1000)}s after the previous hop` : ''}`), note(`from ${hop.from || '—'} ${hop.ip || ''}`)))))),
      panel(h2('Verdicts'), table(['Field', 'Value', 'What it means'], [
        ['SFV', summary.sfv, explainField('SFV', summary.sfv)],
        ['CAT', summary.cat, explainField('CAT', summary.cat)],
        ['SCL', summary.scl, explainField('SCL', summary.scl)],
        ['BCL', summary.bcl, explainField('BCL', summary.bcl)],
        ['PCL', summary.pcl, explainField('PCL', summary.pcl)],
        ['SPF', summary.spf, analysis.authentication?.explanation?.[0] || ''],
        ['DMARC', summary.dmarc, ''],
        ['compauth', summary.compauth, ''],
      ])),
      panel(h2('Findings'), table(['Severity', 'Finding', 'Detail'], (analysis.findings || []).map(f => [f.severity, f.title, f.detail]))),
    );
  };
  const loadText = text => { try { show(analyze(text, { traceDetail: state.trace?.detail || state.trace?.events || [] })); } catch (error) { out.replaceChildren(el('div', { class: 'callout warn', text: error.message })); } };
  const buttons = el('div', { class: 'row' });
  for (const sample of Object.values(SAMPLES)) {
    buttons.append(el('button', { class: 'btn sm', type: 'button', text: sample.label, onclick: e => { area.value = sample.headers; loadText(sample.headers); flash(e.currentTarget, 'Loaded'); } }));
  }
  buttons.append(el('button', { class: 'btn sm', type: 'button', text: 'Download redacted copy', onclick: e => {
    if (!state.analysis) { flash(e.currentTarget, 'Paste headers first'); return; }
    flash(e.currentTarget, 'Downloaded');
    const blob = new Blob([JSON.stringify(shareCopy(state.analysis), null, 2)], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: 'ex360-hops-redacted.json', text: 'redacted' });
    a.click();
  } }));
  const file = el('input', { type: 'file', accept: '.eml,.msg,.txt' });
  file.addEventListener('change', async () => {
    const chosen = file.files?.[0];
    if (!chosen) return;
    const buf = await chosen.arrayBuffer();
    try {
      const parsed = parseMessageFile(chosen.name, new Uint8Array(buf));
      area.value = parsed.headers;
      loadText(parsed.headers);
    } catch (error) { out.replaceChildren(el('div', { class: 'callout warn', text: error.message })); }
  });
  const fromBox = el('button', { class: 'btn', type: 'button', text: 'Read headers from the open mailbox' });
  fromBox.addEventListener('click', async () => {
    if (!mb()) { out.replaceChildren(note('Open a mailbox first, then come back with an Internet message ID.')); return; }
    const id = prompt('Internet message ID');
    if (!id) return;
    const result = await busy(fromBox, 'Reading the message…', () => get(`/api/headers?user=${encodeURIComponent(mb().id)}&internetMessageId=${encodeURIComponent(id)}${demoAnd()}`));
    if (!result.headers) { out.replaceChildren(callout(result.authorized === false ? result : { label: 'Headers', message: result.message || 'No headers', authorized: true })); return; }
    area.value = result.headers;
    loadText(result.headers);
  });
  area.addEventListener('change', () => loadText(area.value));
  root.append(panel(h2('Four ways in'), p('Paste headers, drop a .eml or .msg file (read in this browser), run a message trace, or read one message from a mailbox with Microsoft Graph. Nothing is sent to a model. Chat is deferred.'), buttons, file, fromBox, area));
  root.append(out);
  pageEl.replaceChildren(root);
  const query = queryFromHash(location.hash);
  const example = headerExample(query.example);
  if (example) { area.value = example.headers; loadText(example.headers); return; }
  const sampleId = query.sample || 'spoof';
  if (SAMPLES[sampleId]) { area.value = SAMPLES[sampleId].headers; loadText(SAMPLES[sampleId].headers); }
}

async function renderOutlook() {
  const data = await get(`/api/outlook-client${demoQuery()}`);
  const report = data.report;
  const root = el('div', { class: 'stack' });
  root.append(panel(
    h2('Why you run a script'),
    p('Ex360 is a container. It has its own disk and it is not your Windows session. It cannot open your Outlook profile, read the OST, or call the Outlook object. The collector runs in Windows PowerShell on the PC, as you, and posts a JSON summary to this container. It only reads.'),
    el('a', { href: '/Collect-Ex360Outlook.ps1', text: 'Download Collect-Ex360Outlook.ps1' }),
    el('pre', { text: 'Unblock-File .\\Collect-Ex360Outlook.ps1\n.\\Collect-Ex360Outlook.ps1 -Server http://localhost:8360' }),
  ));
  if (!report) root.append(note('No report yet. Demo mode shows a fictional laptop. Live mode shows the last report posted to this container.'));
  else {
    root.append(panel(h2(report.computer || 'This PC'), table(['Field', 'Value'], [
      ['Outlook', report.outlook?.version || ''],
      ['Channel', report.outlook?.channel || ''],
      ['Bitness', report.outlook?.bitness || ''],
      ['Autodiscover', report.autodiscover?.result || report.autodiscover?.host || ''],
    ])));
    showRows(root, report.profiles, ['Profile', 'Cached', 'OST', 'Bytes'], r => [r.name, r.cached ? 'Yes' : 'No', r.ost, r.ostBytes]);
    showRows(root, report.addins, ['Add-in', 'Where'], r => [r.name, r.location]);
    showRows(root, report.connectivity, ['Target', 'Reachable'], r => [r.target, r.ok ? 'Yes' : 'No']);
  }
  pageEl.replaceChildren(root);
}

async function renderMigrations() {
  const data = await complianceData();
  const root = el('div', { class: 'stack' });
  const moves = data.migrations?.moves || data.migrations;
  root.append(panel(h2('Endpoints'), grantLinks()));
  showRows(root, asRows(data.migrations?.endpoints || data.migrations), ['Name', 'Type', 'Associated administrator'], r => [xc('migration', r.name || r.Identity), r.type || r.EndpointType, r.admin || r.Username || ''], 'No migration endpoints.', r => [['Remote server', r.remote || r.RemoteServer]]);
  // Exchange admin center > Migration > Migration batches: Name, Status, Data consistency score, Percentage synced, Total, Synced, Finalized, Failed.
  showRows(root, asRows(data.migrations?.batches), ['Name', 'Status', 'Data consistency score', 'Percentage synced', 'Total', 'Synced', 'Finalized', 'Failed'], r => {
    const total = Number(r.total ?? r.TotalCount ?? 0);
    const synced = Number(r.synced ?? r.SyncedCount ?? 0);
    return [xc('migration', r.name || r.Identity), r.status || r.Status || DASH, r.DataConsistencyScore || r.dataConsistencyScore || DASH, total ? `${Math.round((synced / total) * 100)}%` : DASH, total, synced, r.finalized ?? r.FinalizedCount ?? 0, r.failed ?? r.FailedCount ?? 0];
  }, 'No batches.');
  showRows(root, asRows(moves), ['Mailbox', 'Status'], r => [xc('migration', r.mailbox || r.DisplayName || r.Identity), r.status || r.Status], 'No move requests.');
  root.append(portals('migrations'), portals('support'));
  pageEl.replaceChildren(root);
}
// A PowerShell read that failed comes back as { ok: false, error }. Show it as failed, never as an empty list.
function psRows(value) {
  if (value && value.ok === false && !value.label && value.error) {
    const refused = /not authorized|access denied|forbidden|permission/i.test(value.error);
    return refused ? { ok: false, authorized: false, label: 'Not authorized', message: value.error, permission: 'Exchange.Manage', role: 'View-Only Organization Management' } : { ok: false, authorized: true, label: 'Could not read', message: value.error };
  }
  return asRows(value);
}
const when = v => (v ? formatUtc(v) : DASH);
// Admin roles mirrors Exchange admin center > Roles > Admin roles: role groups, then the Entra roles that reach Exchange.
async function renderAdminRoles() {
  const data = await complianceData();
  const root = el('div', { class: 'stack' });
  const groups = psRows(data.exchangeRoles);
  const groupsPanel = panel(h2('Exchange admin roles (role groups)'), note('Same list as Exchange admin center > Roles > Admin roles. Select a role group for its roles, members and who manages it.'));
  if (Array.isArray(groups) && groups.length) {
    // Exchange admin center > Roles > Admin roles shows Role group and Description; roles and members open in the flyout.
    groupsPanel.append(table(['Role group', 'Description'], groups.map(g => [xc('roleGroup', g.Name || g.name), g.Description || g.description || DASH]), {
      onRowClick: i => {
        const g = groups[i];
        openDetails(g.Name || g.name, p(g.Description || ''),
          el('h3', { text: 'Assigned roles' }), table(['Role'], names(g.Roles).map(r => [r])),
          el('h3', { text: 'Members' }), names(g.Members || g.members).length ? table(['Member'], names(g.Members || g.members).map(m => [m])) : note('No members.'),
          el('h3', { text: 'Managed by' }), p(names(g.ManagedBy).join(', ') || DASH));
      },
    }));
  } else showRows(groupsPanel, groups, [], () => [], 'No Exchange role groups.');
  root.append(groupsPanel);
  const entra = data.entraRoles?.value || data.entraRoles;
  const entraPanel = panel(h2('Microsoft Entra roles that reach Exchange Online'), note('Only the directory roles that grant Exchange, Defender for Office 365 or Purview access to email. The full list is in the Microsoft Entra admin center. Only roles with at least one member, or activated, are listed by Microsoft Graph.'));
  const rows = denied(entra) || entra?.ok === false ? entra : entraExchangeRoles(entra);
  showRows(entraPanel, rows, ['Role', 'Description', 'Members'], r => [objCell(r.name, 'entraRole'), r.means, names(r.members).join(', ') || 'Nobody'], 'No Exchange-related directory roles have members.');
  root.append(entraPanel);
  root.append(panel(h2('Purview and Defender role groups for email'), p('Role groups in Microsoft Purview and the Defender portal\'s Email & collaboration roles (for example Security Reader, Quarantine Administrator, eDiscovery Manager) live in Security & Compliance PowerShell. They are listed on Organization > Compliance > Compliance admin.'), el('a', { class: 'btn primary', href: '#compliance-admin', text: 'Open Compliance admin' })));
  root.append(portals('admin-roles'));
  pageEl.replaceChildren(root);
}
// User roles mirrors Exchange admin center > Roles > User roles (role assignment policies).
async function renderUserRoles() {
  const data = await complianceData();
  const root = el('div', { class: 'stack' });
  const rows = psRows(data.userRoles);
  const box = panel(h2('User roles'), note('Each mailbox has one role assignment policy (RoleAssignmentPolicy on Get-Mailbox). It decides what people may change for themselves in Outlook and Outlook on the web. New mailboxes get the Default policy. Select a policy for its roles in plain words.'));
  if (Array.isArray(rows) && rows.length) {
    box.append(table(['Name', 'Description', 'Roles'], rows.map(r => [xc('userRolePolicy', r.Name), r.Description || DASH, names(r.AssignedRoles).join(', ') || DASH]), {
      onRowClick: i => {
        const r = rows[i];
        openDetails(r.Name, p(r.Description || ''), p(r.IsDefault === true || r.IsDefault === 'True' ? 'This is the default policy for new mailboxes.' : 'Not the default. Mailboxes get it only when an admin sets it.', 'muted'),
          el('h3', { text: 'What people with this policy can do' }), table(['Role', 'Lets the person'], names(r.AssignedRoles).map(role => [role, userRoleWords(role)])),
          el('pre', { class: 'report-pre', text: `Get-Mailbox -ResultSize Unlimited -Filter "RoleAssignmentPolicy -eq '${String(r.Name).replace(/'/g, "''")}'" | Format-Table DisplayName, PrimarySmtpAddress` }));
      },
    }));
  } else showRows(box, rows, [], () => [], 'No role assignment policies were returned.');
  root.append(box, portals('user-roles'));
  pageEl.replaceChildren(root);
}
// Role assignments and scopes has no portal page of its own: the admin center shows parts of it inside each role group.
// The layout follows Get-ManagementRoleAssignment and Get-ManagementScope.
async function renderRoleAssignments() {
  const data = await complianceData();
  const root = el('div', { class: 'stack' });
  root.append(el('div', { class: 'callout' }, el('strong', { text: 'No single portal page shows this' }), p('The Exchange admin center shows a role group\'s roles and write scope inside that role group. Every assignment in one list, and the management scopes, are only in PowerShell, so this page follows the cmdlet output.')));
  const all = psRows(data.roleAssignments);
  const split = splitAssignments(all);
  const cols = ['Role', 'Assigned to', 'Assigned through', 'Write scope', 'Enabled'];
  const row = a => [xc('roleAssignment', a.Role), a.RoleAssignee || a.RoleAssigneeName, a.RoleAssigneeType, assignmentScope(a), checkMark(a.Enabled !== false && a.Enabled !== 'False')];
  for (const [title, list, empty, why] of [
    ['Direct assignments to a person or group', split.direct, 'No roles are assigned directly to a person. Good: role groups are easier to audit.', 'Roles given to a user or security group without a role group. Microsoft recommends role groups instead, because these are easy to forget when someone changes jobs.'],
    ['Admin role groups', split.admin, 'No role group assignments were returned.', 'Roles each admin role group holds, and over which recipients.'],
    ['Applications (RBAC for Applications)', split.app, 'No application role assignments. Apps get mailbox access only from Microsoft Entra permissions or legacy application access policies.', 'Roles given to an app. App access shows the apps themselves.'],
    ['User roles (role assignment policies)', split.user, 'No user role assignments were returned.', 'The end-user roles inside each role assignment policy. Their scope is always the person\'s own mailbox or groups.'],
  ]) {
    const box = panel(h2(title), note(why));
    showRows(box, list, cols, row, empty);
    root.append(box);
  }
  const scopes = panel(h2('Management scopes'), note('A scope limits a role assignment to some recipients, for example one department. An exclusive scope also stops everyone else from managing those recipients.'));
  showRows(scopes, psRows(data.managementScopes), ['Name', 'Scope type', 'Recipient filter', 'Exclusive'], s2 => [xc('managementScope', s2.Name), s2.ScopeRestrictionType, s2.RecipientFilter || s2.RecipientRoot || DASH, checkMark(s2.Exclusive === true || s2.Exclusive === 'True')], 'No management scopes. Every role assignment covers the whole organization or the person\'s own mailbox.');
  root.append(scopes, portals('role-assignments'));
  pageEl.replaceChildren(root);
}
// App access: apps that can reach mailboxes, from Exchange's side.
async function renderAppRbac() {
  const data = await complianceData();
  const root = el('div', { class: 'stack' });
  root.append(el('div', { class: 'callout' }, el('strong', { text: 'Exchange\'s side only' }), p('RBAC for Applications gives an app a mailbox role (for example Application Mail.Read) over a scope of mailboxes. An app can also have unscoped Microsoft Graph permissions such as Mail.Read granted in Microsoft Entra ID, which reach every mailbox; those are in the Microsoft Entra admin center under Enterprise applications.')));
  const sps = psRows(data.servicePrincipals);
  const assignments = splitAssignments(psRows(data.roleAssignments)).app;
  const spBox = panel(h2('Service principals in Exchange Online'), note('Pointers to Microsoft Entra apps that have, or can be given, Exchange roles. Select one for its roles.'));
  if (Array.isArray(sps) && sps.length) {
    spBox.append(table(['Name', 'Application ID', 'Object ID', 'Exchange roles'], sps.map(sp => [objCell(sp.DisplayName, 'servicePrincipal', { id: sp.ObjectId, appId: sp.AppId }), sp.AppId, sp.ObjectId, Array.isArray(assignments) ? assignments.filter(a => (a.RoleAssignee || '') === sp.DisplayName).length : DASH]), {
      onRowClick: i => {
        const sp = sps[i];
        const mine = Array.isArray(assignments) ? assignments.filter(a => (a.RoleAssignee || '') === sp.DisplayName) : [];
        openDetails(sp.DisplayName, table(['Field', 'Value'], [['Application (client) ID', sp.AppId], ['Object ID', sp.ObjectId]]),
          el('h3', { text: 'Exchange roles' }), mine.length ? table(['Role', 'Mailboxes it covers'], mine.map(a => [a.Role, assignmentScope(a)])) : note('No Exchange roles assigned.'),
          el('pre', { class: 'report-pre', text: `Test-ServicePrincipalAuthorization -Identity ${sp.AppId}` }));
      },
    }));
  } else showRows(spBox, sps, [], () => [], 'No service principals in Exchange Online.');
  root.append(spBox);
  const legacy = panel(h2('Application access policies (legacy)'), note('The older way to limit an app\'s Graph or EWS mail permission to a group of mailboxes. Microsoft replaces these with RBAC for Applications.'));
  showRows(legacy, psRows(data.appAccessPolicies), ['Application ID', 'Scope (group)', 'Access', 'Description'], a => [xc('appAccessPolicy', a.AppId), a.ScopeName, a.AccessRight === 'RestrictAccess' ? 'Only this group' : a.AccessRight === 'DenyAccess' ? 'Everyone except this group' : a.AccessRight, a.Description || DASH], 'No application access policies.');
  root.append(legacy, portals('app-rbac'));
  pageEl.replaceChildren(root);
}
async function renderChanges() {
  const root = el('div', { class: 'stack' });
  root.append(panel(h2('Exchange admin audit'), p('Search-AdminAuditLog is a read. It lists who changed Exchange configuration. Entra directory changes are a separate list.'), grantLinks()));
  // Logs wait for a search. An empty box lists every change Ex360 read.
  const input = el('input', { type: 'search', placeholder: 'Who, cmdlet, object or activity (leave empty to list all)', 'aria-label': 'Search changes' });
  const button = el('button', { class: 'btn primary', type: 'submit', text: 'Search changes' });
  const form = el('form', { class: 'row' }, el('div', { class: 'grow' }, input), button);
  const out = el('div', { class: 'stack' }, note('Nothing is listed until you search.'));
  form.addEventListener('submit', event => {
    event.preventDefault();
    busy(button, 'Searching changes…', async () => {
      out.replaceChildren(el('p', { class: 'loading', text: 'Reading the audit logs…' }));
      const data = await complianceData();
      const q = input.value.trim().toLowerCase();
      const hit = values => !q || values.some(v => String(v || '').toLowerCase().includes(q));
      out.replaceChildren();
      const changes = asRows(data.changes);
      const directory = asRows(data.directoryAudit);
      showRows(out, Array.isArray(changes) ? changes.filter(r => hit([r.caller, r.Caller, r.cmdlet, r.CmdletName, r.object, r.ObjectModified])) : changes, ['When', 'Who', 'Cmdlet', 'Object'], r => [r.when || r.RunDate, r.caller || r.Caller, r.cmdlet || r.CmdletName, r.object || r.ObjectModified], 'No Exchange admin audit rows match.');
      showRows(out, Array.isArray(directory) ? directory.filter(r => hit([r.initiatedBy?.user?.userPrincipalName, r.activityDisplayName])) : directory, ['Date', 'Service', 'Category', 'Activity', 'Status', 'Status Reason'], r => [formatUtc(r.activityDateTime), r.loggedByService || DASH, r.category || DASH, r.activityDisplayName || DASH, r.result || DASH, r.resultReason || DASH], 'No Entra audit rows match.', r => [['Target(s)', (r.targetResources || []).map(t => t.userPrincipalName || t.displayName).filter(Boolean).join(', ')], ['Initiated by (actor)', r.initiatedBy?.user?.userPrincipalName || r.initiatedBy?.app?.displayName || '']]);
    });
  });
  root.append(panel(h2('Search changes'), form), out, portals('changes'));
  pageEl.replaceChildren(root);
}
async function renderDlp() {
  const data = await complianceData();
  const root = el('div', { class: 'stack' });
  const gap = licenseLine('dlp');
  if (gap) root.append(gap);
  root.append(panel(h2('Policies'), p('Mode: TestWithoutNotifications only logs. TestWithNotifications logs and shows the sender a policy tip. Enable acts (tip, block, or both). A policy without the Exchange workload does not apply to mail. A policy whose distribution is not Success has not reached the service yet, which looks like "the policy does nothing".'), grantLinks()));
  showRows(root, asRows(data.dlp), ['Name', 'Priority', 'Mode', 'Policy sync status', 'Last modified'], r => [objCell(r.name, 'dlp'), r.priority ?? '', r.mode, r.distribution || '', whenCell(r.changed)], 'No DLP policies.', r => [['Workloads', (r.workloads || []).join(', ')], ['Scope', r.scope === 'all' ? 'All mailboxes' : [...(r.users || []), ...(r.groups || [])].join(', ') || 'Not limited']]);
  root.append(panel(h2('Rules'), p('Each rule is a condition (usually sensitive information types) and actions. When a user says DLP blocked a message, find the rule here, then trace the message: the detail shows a DLP rule event with the policy name.')));
  showRows(root, asRows(data.dlpRules), ['Rule', 'Policy', 'Looks for', 'Blocks', 'Notifies', 'Severity'], r => [objCell(r.name + (r.disabled ? ' (disabled)' : ''), 'dlp'), r.policy, (r.sensitiveTypes || []).join(', ') || (r.advanced ? 'Conditions built in the Purview editor. Open the rule to read them.' : '—'), r.blocks ? `Yes${r.blockScope ? ` (${r.blockScope})` : ''}` : 'No', (r.notifyUser || []).join(', ') || 'Nobody', r.severity || ''], 'No DLP rules.');
  root.append(el('div', { class: 'callout' }, el('strong', { text: 'Troubleshooting a DLP match' }), steps([
    'Trace the message on Trace a message and choose Explain. A DLP rule event names the policy and rule.',
    'Check the policy mode above. Test modes never block.',
    'Check distribution. Pending or Error means the policy is not live yet.',
    'Check that the sender is in scope (Compliance on this mailbox shows which policies apply to one person).',
    'Read the match detail in Purview, Activity explorer, or test text against the sensitive info type in Purview, Data classification.',
  ]), el('a', { class: 'btn', href: '#trace', text: 'Trace a message' })));
  root.append(portals('dlp'));
  pageEl.replaceChildren(root);
}

async function renderLabels() {
  const data = await complianceData();
  const root = el('div', { class: 'stack' });
  const gap = licenseLine('labels');
  if (gap) root.append(gap);
  root.append(grantLinks());
  showRows(root, asRows(data.labels), ['Name', 'Priority', 'Scope', 'Created by', 'Last modified'], r => [objCell(r.name || r.displayName, 'label'), r.priority ?? '', r.contentType || '', r.createdBy || '', whenCell(r.changed)], 'No sensitivity labels.');
  showRows(root, asRows(data.labelPolicies), ['Name', 'Priority', 'Policy sync status', 'Created by', 'Last modified'], r => [objCell(r.name, 'labelPolicy'), r.priority ?? '', r.distribution || '', r.createdBy || '', whenCell(r.changed)], 'No label policies.', r => [['Labels', (r.labels || []).join(', ')], ['Published to', r.publishedTo || '']]);
  root.append(portals('labels'));
  pageEl.replaceChildren(root);
}
async function renderRetention() {
  const data = await complianceData();
  const root = el('div', { class: 'stack' });
  const gap = licenseLine('retention');
  if (gap) root.append(gap);
  root.append(grantLinks());
  showRows(root, asRows(data.retentionPolicies), ['Name', 'Created by', 'Last modified'], r => [objCell(r.name, 'retention'), r.createdBy || '', whenCell(r.changed)], 'No retention policies.', r => [['Workloads', (r.workloads || []).join(', ')], ['Retention', r.duration || '']]);
  showRows(root, asRows(data.retentionLabels), ['Name', 'Retention duration', 'Created by', 'Last modified'], r => [objCell(r.name || r.displayName, 'retentionLabel'), r.retention || r.retentionDuration || '', r.createdBy || '', whenCell(r.changed)], 'No retention labels.');
  root.append(portals('retention-purview'));
  pageEl.replaceChildren(root);
}
async function renderEdiscovery() {
  const data = await complianceData();
  const root = el('div', { class: 'stack' });
  const gap = licenseLine('ediscovery');
  if (gap) root.append(gap);
  root.append(grantLinks());
  showRows(root, asRows(data.cases), ['Case name', 'Status', 'Created', 'Last modified', 'Modified by', 'Number', 'Description'], r => [objCell(r.name || r.displayName, 'ediscovery'), r.status, whenCell(r.created), whenCell(r.changed), r.modifiedBy || '', r.number || '', r.description || ''], 'No eDiscovery cases.', r => [['Holds', (r.holds || []).map(h => h.name).join(', ') || 'None']]);
  root.append(portals('ediscovery'));
  pageEl.replaceChildren(root);
}
async function renderAudit() {
  const data = await complianceData();
  const root = el('div', { class: 'stack' });
  const gap = licenseLine('audit');
  if (gap) root.append(gap);
  const rawAudit = data.audit || {};
  const audit = rawAudit.value && !Array.isArray(rawAudit.value) ? rawAudit.value : rawAudit;
  const enabled = audit.enabled ?? audit.UnifiedAuditLogIngestionEnabled;
  root.append(panel(h2('Unified audit'), table(['Field', 'Value'], [
    ['Enabled', enabled == null ? '' : enabled ? 'Yes' : 'No'],
    ['Retention (days)', audit.retentionDays ?? audit.AdminAuditLogAgeLimit ?? ''],
  ]), grantLinks()));
  if (denied(data.auditEvents)) root.append(callout(denied(data.auditEvents)));
  const form = el('form', { class: 'row' });
  const user = el('input', { name: 'user', placeholder: 'User', value: '' });
  const operation = el('input', { name: 'operation', placeholder: 'Operation', value: '' });
  const searchButton = el('button', { class: 'btn primary', type: 'submit', text: 'Search (read)' });
  form.append(user, operation, searchButton);
  form.addEventListener('submit', event => {
    event.preventDefault();
    busy(searchButton, 'Searching the audit log…', async () => {
      const q = new URLSearchParams({ user: user.value, operation: operation.value });
      if (state.demo) q.set('demo', '1');
      state.compliance = await get(`/api/compliance?${q}`);
      state.auditSearched = true;
    }).then(() => render());
  });
  root.append(panel(h2('Search'), form));
  if (state.auditSearched) showRows(root, asRows(data.auditEvents), ['Date (UTC)', 'IP Address', 'User', 'Record type', 'Activity', 'Item'], r => { const d = auditData(r); return [formatUtc(r.when || r.CreationDate), d.ClientIP || d.ClientIPAddress || DASH, r.user || r.UserIds || DASH, r.RecordType || r.recordType || DASH, r.operation || r.Operations || DASH, d.ObjectId || DASH]; }, 'No audit events in this window.');
  else root.append(note('Audit events are not listed until you search. Leave both boxes empty to list the latest.'));
  root.append(portals('audit'));
  pageEl.replaceChildren(root);
}
async function renderComplianceAdmin() {
  const data = await complianceData();
  const root = el('div', { class: 'stack' });
  root.append(panel(h2('Purview role groups'), p('These are the people who can open the compliance portal and run the read cmdlets behind these pages.'), grantLinks()));
  showRows(root, asRows(data.purviewRoles), ['Name', 'Type', 'Roles', 'Users', 'Security groups'], r => [objCell(r.name, 'purviewRole'), '', (r.roles || []).length || '', (r.members || []).map(m => m.displayName || m).join(', '), ''], 'No Purview role groups in this snapshot.', r => [['Description', r.description || ''], ['Roles', (r.roles || []).join(', ')]]);
  root.append(portals('compliance-admin'));
  pageEl.replaceChildren(root);
}
function renderMbCompliance() {
  return guard(async (root, mailbox) => {
    const data = await complianceData();
    const who = mailboxWho();
    const policies = asRows(data.dlp);
    const kept = asRows(data.retentionPolicies);
    const cases = asRows(data.cases);
    root.append(licenseLine('dlp') || note(''));
    showRows(root, Array.isArray(policies) ? dlpForMailbox(policies, who) : policies, ['Policy', 'Mode', 'Why'], r => [objCell(r.name, 'dlp'), r.mode, r.why]);
    showRows(root, Array.isArray(kept) ? retentionForMailbox(kept, who) : kept, ['Policy', 'Why'], r => [objCell(r.name, 'retention'), r.why]);
    showRows(root, Array.isArray(cases) ? holdsForMailbox(cases, who) : cases, ['Hold', 'Why'], r => [objCell(r.hold || r.name, 'ediscovery'), r.why]);
    root.append(portals('dlp'), portals('ediscovery'));
  });
}
function renderMbCa() {
  return guard(async (root, mailbox) => {
    const data = await complianceData();
    const who = mailboxWho();
    root.append(panel(h2('Exchange and Office 365'), p('A policy applies here when it is enabled and its cloud apps include Exchange Online, Office 365, or all apps, and this user is in scope. Policy.Read.All is already on the first sign-in.')));
    const policies = asRows(data.ca);
    showRows(root, Array.isArray(policies) ? caForMailbox(policies, who) : policies, ['Policy name', 'Grant', 'Why'], r => [objCell(r.name, 'caPolicy', { id: r.id }), r.grant, r.why]);
    root.append(portals('conditional-access'));
  });
}
function renderMbXdr() {
  return guard(async (root, mailbox) => {
    const data = await complianceData();
    const rawAlerts = asRows(data.alerts);
    const alerts = Array.isArray(rawAlerts) ? alertsForMailbox(rawAlerts, mailboxWho()) : rawAlerts;
    if (denied(data.incidents)) root.append(callout(denied(data.incidents)));
    showRows(root, asRows(data.incidents), ['Incident name', 'Status', 'Severity'], r => [objCell(r.displayName || r.title || r.name, 'incident', { id: r.id }), r.status, r.severity]);
    showRows(root, alerts, ['Alert name', 'Severity'], r => [objCell(r.title || r.name, 'alert', { id: r.id }), r.severity], 'No alerts for this recipient.');
    root.append(portals('xdr'), portals('support'));
  });
}

const LEGACY_VIEWS = { mailbox: 'mb-recipient', 'mb-report': 'mb-recipient', recipients: 'rcp-shared' };
// Pages that work without a sign-in: setup, the new hire pages, the header analyzer, the Outlook collector and NextHop.
// NextHop works from the sample topology or an export file opened in the browser, so it needs no sign-in either.
const SIGNED_OUT_VIEWS = new Set(['setup', 'start', 'needs', 'asked', 'glossary', 'learn', 'playbooks', 'hops', 'outlook', 'nexthop']);
function signInFirst(view) {
  return panel(h2('Sign in to see your tenant'),
    p('This page reads your Microsoft 365 tenant as you, with your own permissions. Nothing shows until you sign in.'),
    el('div', { class: 'row' }, el('a', { class: 'btn primary', href: loginPath({ returnTo: view }), text: 'Sign in' }), el('a', { class: 'btn', href: '#setup', text: 'Open Setup steps' })));
}
async function render() {
  const seq = ++renderSeq;
  // Old links to the pages merged into Single recipient > Recipient still land there.
  const legacy = viewFromHash(location.hash, v => v in LEGACY_VIEWS);
  if (legacy) history.replaceState(null, '', `#${LEGACY_VIEWS[legacy]}`);
  const id = viewFromHash(location.hash, isPage) || 'start';
  renderConnections();
  if (!viewFromHash(location.hash, isPage)) writeView(id);
  setTitle(id);
  const needsOrg = ['review', 'licenses', 'domains', 'connectors', 'rules', 'security', 'sec-antispam', 'sec-antiphish', 'sec-antimalware', 'sec-safelinks', 'sec-safeattach', 'sec-outbound', 'sec-connection', 'sec-quarantine', 'config', 'health', 'mb-recipient', 'mb-forward', 'mb-rules', 'mb-delegation', 'mb-groups', 'mb-policies', 'mb-protocols', 'mb-signins', 'mb-findings'].includes(id);
  // Signed out, a page that reads the tenant shows a sign-in prompt instead of sample data.
  if (!state.demo && !state.session.signedIn && !SIGNED_OUT_VIEWS.has(id)) { pageEl.replaceChildren(signInFirst(id)); return; }
  // The heading changes at once; the body says it is loading instead of showing the last page.
  pageEl.replaceChildren(loadingPanel(id));
  try {
    if (needsOrg && !state.org) state.org = await shared(`/api/org${demoQuery()}`);
    if (id.startsWith('mb-')) await ensureBox();
    if (seq !== renderSeq) return;
    await views[id]();
  } catch (error) {
    if (error === STALE || seq !== renderSeq) return;
    pageEl.replaceChildren(callout({ label: 'This page could not load', message: `Ex360 could not reach its own server: ${error?.message || error}. Check that the container is running, then choose Read again.` }));
  }
}

async function boot() {
  let storage = null;
  try { storage = localStorage; } catch { /* blocked */ }
  applyTheme(document, initialTheme(storage, window));
  $('theme-toggle').addEventListener('click', () => toggleTheme(document, storage));
  installShell(document);
  state.session = await get('/api/session');
  // No demo switch: signed out, pages ask you to sign in. Demo data runs only when the server is started with
  // EX360_DEMO=1 (the automated tests and local development).
  state.demo = state.session.demo === true;
  try { const kept = JSON.parse(sessionStorage.getItem('ex360-recipient') || 'null'); if (kept?.id) { state.mailboxId = kept.id; state.mailboxSource = kept.source || 'user'; } } catch { /* storage unavailable */ }
  $('mode-badge').textContent = state.demo ? 'DEMO' : state.session.signedIn ? 'LIVE' : 'SIGNED OUT';
  $('mode-badge').className = `badge ${state.demo ? 'demo' : state.session.signedIn ? 'live' : ''}`.trim();
  $('who').textContent = state.session.signedIn ? (state.session.account?.username || '') : state.session.consent;
  if (state.session.staleCookie || state.session.refreshError) {
    const warn = el('a', { class: 'btn primary sm', href: '#setup', text: state.session.staleCookie ? 'Ex360 restarted. Sign in again' : 'Sign-in needs attention' });
    $('who').after(warn);
  }
  $('viewer-button').textContent = state.session.signedIn ? `Sign out ${state.session.account?.name || ''}`.trim() : 'Sign in';
  $('viewer-button').title = state.session.signedIn ? 'Sign out of Ex360' : 'Signs in once to Graph, Exchange, Purview Graph and Compliance PowerShell';
  $('viewer-button').addEventListener('click', () => { leaving($('viewer-button'), state.session.signedIn ? 'Signing out…' : 'Opening sign-in…'); location.href = state.session.signedIn ? '/auth/logout' : loginPath({ returnTo: currentView() }); });
  $('refresh-data').addEventListener('click', () => busy($('refresh-data'), 'Reading again…', () => { forgetReads(); return render(); }));
  installPressFeedback(document);
  // One listener. Before, popstate and two hashchange listeners each re-rendered and threw away every cached
  // read, so each page change re-ran the Exchange Online PowerShell reads, two or three times over.
  window.addEventListener('hashchange', () => render());
  window.addEventListener('unhandledrejection', event => { if (event.reason === STALE) event.preventDefault(); });
  // Start the shared organization read now, so the Organization pages are ready by the time they are opened.
  if (!state.demo) shared(`/api/org${demoQuery()}`).then(org => { if (!state.org) state.org = org; }).catch(() => { /* the page shows the error when opened */ });
  await render();
}
boot();
