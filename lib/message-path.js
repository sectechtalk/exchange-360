// Message path: the tenant's mail flow configuration laid out as the steps Exchange Online applies, in order, for
// inbound and outbound mail. Each step lists the configuration objects that act there (connectors, rules, policies,
// domains, the mailbox). pathOverlay() then lays one NextHop prediction over it: which steps the message reached,
// where it stopped, and which objects acted on it and why. Pure functions: no DOM, so tests run them directly.
import { items, list, bool, orgOf } from './nexthop.js';

const str = v => (v == null ? '' : String(v));
const lc = v => str(v).toLowerCase();

export const INBOUND_STOPS = [
  { id: 'sender', title: 'Outside sender' },
  { id: 'door', title: 'Front door: accepted domains' },
  { id: 'connection', title: 'Connection: connectors and IP filtering' },
  { id: 'malware', title: 'Anti-malware' },
  { id: 'rules', title: 'Mail flow rules and DLP (priority order)' },
  { id: 'spam', title: 'Anti-phishing and anti-spam' },
  { id: 'after', title: 'Safe Attachments, Safe Links, journaling' },
  { id: 'mailbox', title: 'Recipient mailbox' },
];
export const OUTBOUND_STOPS = [
  { id: 'sender', title: 'Sender mailbox' },
  { id: 'malware', title: 'Anti-malware and outbound spam' },
  { id: 'rules', title: 'Mail flow rules, DLP, journaling' },
  { id: 'remote', title: 'Remote domain' },
  { id: 'connector', title: 'Outbound connector and DKIM' },
  { id: 'destination', title: 'Outside recipient' },
];

// The step (index into the stops above) where each NextHop component happens. Longest prefix wins; a component
// that is not listed stays at the step of the line before it.
const IN_MAP = [
  ['The Internet', 0], ['Exchange Online front door', 1],
  ['Inbound connector', 2], ['Enhanced filtering', 2], ['Recipient', 2], ['Message size limit', 2], ['Advanced delivery', 2], ['Connection filter', 2],
  ['Tenant Allow/Block List: URL', 6], ['Tenant Allow/Block List', 2],
  ['Anti-malware', 3],
  ['Mail flow rule', 4], ['Data loss prevention', 4],
  ['Anti-phishing', 5], ['Anti-spam', 5],
  ['Safe Attachments', 6], ['Safe Links', 6], ['Journaling', 6], ['Auto-labeling', 6], ['Outlook external tag', 6],
  ['Mailbox', 7], ['Inbox rule', 7], ['Retention and holds', 7], ['Outlook', 7], ['Forward', 7], ['Automatic reply', 7],
];
const OUT_MAP = [
  ['Recipient', 0], ['Message size limit', 0], ['Sensitivity label', 0], ['Mailbox', 0], ['Automatic reply', 0], ['Inbox rule', 0], ['Forward', 0],
  ['Anti-malware', 1], ['Outbound spam', 1],
  ['Mail flow rule', 2], ['Data loss prevention', 2], ['Auto-labeling', 2], ['Journaling', 2],
  ['Remote domain', 3],
  ['Outbound connector', 4], ['DKIM signing', 4],
  ['Outbound delivery', 5],
];
export function stopOf(direction, component, previous = 0) {
  const map = direction === 'outbound' ? OUT_MAP : IN_MAP;
  const c = str(component);
  let best = null;
  for (const [prefix, i] of map) if (c.startsWith(prefix) && (!best || prefix.length > best[0].length)) best = [prefix, i];
  return best ? best[1] : previous;
}

export const keyOf = (kind, name) => `${kind}:${lc(name)}`;
// DLP steps name "Policy > Rule"; the diagram shows the policy.
const objectKey = o => keyOf(o.kind, o.kind === 'dlp' ? str(o.name).split(' > ')[0] : o.name);

const nameOf = x => str(x?.Name || x?.DisplayName || x?.Identity || x?.Domain || x?.DomainName);
const isOn = x => !(lc(x?.State) === 'disabled' || x?.Enabled === false || lc(x?.Enabled) === 'false' || x?.Enable === false || x?.Disabled === true);
const isTest = x => /^(audit|test)/i.test(str(x?.Mode));
const prio = x => (Number.isFinite(Number(x?.Priority)) ? Number(x.Priority) : 9999);

function obj(kind, type, item, extra = {}) {
  const name = extra.name || nameOf(item);
  return { key: keyOf(kind, name), kind, type, name, on: isOn(item), test: isTest(item), priority: prio(item), item, ...extra };
}

// Which directions a mail flow rule can act on, read from its scope conditions only (sender inside or outside,
// recipient inside or outside). A rule without scope conditions is shown on both.
export function ruleDirections(rule) {
  const from = lc(rule.FromScope), to = lc(rule.SentToScope);
  return {
    inbound: from !== 'inorganization' && to !== 'notinorganization',
    outbound: from !== 'notinorganization' && to !== 'inorganization',
  };
}

export function pathModel(cfg) {
  const org = orgOf(cfg);
  const mailboxAddr = org.mailbox.primary || '';
  const mailbox = mailboxAddr ? obj('mailbox', 'User mailbox', items(cfg, 'mailbox')[0] || {}, { name: mailboxAddr, display: org.mailbox.displayName || mailboxAddr }) : null;
  const rules = items(cfg, 'transportRules').slice().sort((a, b) => prio(a) - prio(b));
  const dlp = items(cfg, 'dlpPolicies').slice().sort((a, b) => prio(a) - prio(b)).map(p => obj('dlp', 'DLP policy', p, { test: /^test/i.test(str(p.Mode)) }));
  const journal = items(cfg, 'journalRules').map(j => obj('journalRule', 'Journal rule', j));
  const malware = items(cfg, 'antiMalwarePolicies').map(p => obj('antiMalware', 'Anti-malware policy', p));
  const domains = items(cfg, 'acceptedDomains').map(d => obj('domain', `Accepted domain (${d.DomainType || 'Authoritative'})`, d, { name: d.DomainName || d.Name }));

  const inbound = INBOUND_STOPS.map(s => ({ ...s, objects: [] }));
  const outbound = OUTBOUND_STOPS.map(s => ({ ...s, objects: [] }));
  inbound[0].objects.push({ key: 'party:sender', kind: 'party', type: 'Outside sender', name: 'The sender in the test message', on: true, item: null, synthetic: true });
  inbound[1].objects.push(...domains);
  inbound[2].objects.push(
    ...items(cfg, 'inboundConnectors').map(c => obj('connector', 'Inbound connector', c)),
    ...items(cfg, 'connectionFilterPolicies').map(p => obj('connectionFilter', 'Connection filter policy', p)),
    ...items(cfg, 'phishSimOverridePolicy').map(p => obj('advancedDelivery', 'Advanced delivery: phishing simulation', p)),
    ...items(cfg, 'secOpsOverridePolicy').map(p => obj('advancedDelivery', 'Advanced delivery: SecOps mailbox', p)));
  inbound[3].objects.push(...malware);
  inbound[4].objects.push(...rules.filter(r => ruleDirections(r).inbound).map(r => obj('transportRule', 'Mail flow rule', r)), ...dlp);
  inbound[5].objects.push(
    ...items(cfg, 'antiPhishPolicies').map(p => obj('antiPhish', 'Anti-phishing policy', p)),
    ...items(cfg, 'antiSpamPolicies').map(p => obj('antiSpam', 'Anti-spam inbound policy', p)));
  inbound[6].objects.push(
    ...items(cfg, 'safeAttachmentPolicies').map(p => obj('safeAttachments', 'Safe Attachments policy', p)),
    ...items(cfg, 'safeLinksPolicies').map(p => obj('safeLinks', 'Safe Links policy', p)),
    ...journal);
  if (mailbox) inbound[7].objects.push(mailbox);
  inbound[7].objects.push(
    ...items(cfg, 'inboxRules').map(r => obj('inboxRule', 'Inbox rule', r)),
    ...items(cfg, 'retentionPolicies').map(p => obj('retention', 'Retention policy (Purview)', p)),
    ...items(cfg, 'mrmRetentionPolicies').map(p => obj('mrmPolicy', 'Retention policy (Exchange MRM)', p)),
    ...items(cfg, 'caseHoldPolicies').map(p => obj('ediscovery', 'eDiscovery hold', p)));

  if (mailbox) outbound[0].objects.push(mailbox);
  outbound[0].objects.push(...items(cfg, 'mailboxMemberOf').map(g => obj('group', g.RecipientTypeDetails === 'GroupMailbox' ? 'Microsoft 365 group' : 'Distribution list', g)));
  outbound[2].objects.push(...rules.filter(r => ruleDirections(r).outbound).map(r => obj('transportRule', 'Mail flow rule', r)), ...dlp, ...journal,
    ...items(cfg, 'autoLabelPolicies').map(p => obj('autoLabel', 'Auto-labeling policy', p, { test: /simulat|test/i.test(str(p.Mode)) })));
  outbound[1].objects.push(...malware, ...items(cfg, 'outboundSpamPolicies').map(p => obj('outbound', 'Anti-spam outbound policy', p)));
  outbound[3].objects.push(...items(cfg, 'remoteDomains').map(d => obj('remoteDomain', `Remote domain (${d.DomainName || '*'})`, d)));
  outbound[4].objects.push(
    ...items(cfg, 'outboundConnectors').map(c => obj('connector', 'Outbound connector', c)),
    ...items(cfg, 'dkimSigningConfig').map(d => obj('dkim', 'DKIM signing', d, { name: d.Domain || d.Name, on: bool(d.Enabled) })));
  outbound[5].objects.push({ key: 'party:recipient', kind: 'party', type: 'Outside recipient', name: 'The recipient in the test message', on: true, item: null, synthetic: true });

  return { inbound, outbound, mailbox: mailboxAddr, sample: !!cfg?.sample };
}

const TONE_RANK = { ok: 0, info: 1, medium: 2, high: 3 };
const worse = (a, b) => ((TONE_RANK[b] ?? 0) > (TONE_RANK[a] ?? -1) ? b : a);
const delivered = outcome => /^(delivered|sent)/i.test(str(outcome));

// Lays one prediction over the model's rail for that direction.
// Returns { direction, stops: [{ state: 'passed'|'stopped'|'not-reached'|'reached', tone, steps: [n] }],
//           hits: Map(key -> { tone, steps: [{ n, component, text, tone }] }), unplaced: [{ key, kind, name, steps }] }.
export function pathOverlay(model, result) {
  if (!result) return null;
  const direction = result.direction === 'outbound' ? 'outbound' : 'inbound';
  const rail = model[direction];
  const stops = rail.map(() => ({ state: 'not-reached', tone: null, steps: [] }));
  const hits = new Map();
  let at = 0;
  for (const step of result.steps || []) {
    at = stopOf(direction, step.component, at);
    stops[at].steps.push(step.n);
    stops[at].tone = worse(stops[at].tone, step.tone);
    const keys = new Set([...(step.objects || []), ...(step.settings || [])].filter(o => o?.kind && o?.name).map(objectKey));
    if (step.component === 'The Internet' && direction === 'inbound') keys.add('party:sender');
    if (step.component === 'Outbound delivery') keys.add('party:recipient');
    for (const key of keys) {
      const h = hits.get(key) || { tone: null, steps: [] };
      h.tone = worse(h.tone, step.tone);
      h.steps.push({ n: step.n, component: step.component, text: step.text, tone: step.tone });
      hits.set(key, h);
    }
  }
  // The fate is decided at the step of the last line. Exchange Online does not run every check in the order the
  // rail shows (outbound malware and spam filtering run before some transport checks), so a step after the final
  // one can still have been passed.
  const finalStop = delivered(result.outcome) ? rail.length - 1 : at;
  if (delivered(result.outcome) && direction === 'outbound') hits.set('party:recipient', hits.get('party:recipient') || { tone: 'ok', steps: [] });
  stops.forEach((s, i) => {
    if (i === finalStop) s.state = delivered(result.outcome) ? 'reached' : 'stopped';
    else if (i < finalStop || s.steps.length) s.state = 'passed';
  });
  if (!delivered(result.outcome)) stops[finalStop].tone = worse(stops[finalStop].tone, result.tone);
  const placed = new Set(rail.flatMap(s => s.objects.map(o => o.key)));
  const unplaced = [...hits.entries()].filter(([k]) => !placed.has(k) && !k.startsWith('party:') && !k.startsWith('transportConfig:'))
    .map(([key, h]) => ({ key, kind: key.split(':')[0], name: h.steps.length ? nameFromSteps(result, key) : key, ...h }));
  return { direction, stops, hits, unplaced, outcome: result.outcome, tone: result.tone };
}
function nameFromSteps(result, key) {
  for (const step of result.steps || []) for (const o of [...(step.objects || []), ...(step.settings || [])]) if (o?.kind && objectKey(o) === key) return o.kind === 'dlp' ? str(o.name).split(' > ')[0] : str(o.name);
  return key;
}

// Plain-text version of the path for a prediction, one line per step on the rail. Used by "Copy path as text".
export function pathText(model, overlay) {
  if (!overlay) return '';
  const rail = model[overlay.direction];
  const words = { passed: 'passed', reached: 'reached', stopped: 'STOPPED HERE', 'not-reached': 'not reached' };
  const lines = [`${overlay.direction === 'outbound' ? 'Outbound' : 'Inbound'} message path: ${overlay.outcome}`];
  rail.forEach((stop, i) => {
    const s = overlay.stops[i];
    const acted = stop.objects.filter(o => overlay.hits.has(o.key)).map(o => o.name);
    lines.push(`${i + 1}. ${stop.title}: ${words[s.state]}${acted.length ? ` (${acted.join('; ')})` : ''}`);
  });
  return lines.join('\n');
}

// ---------------------------------------------------------------------------------------------------------------
// Mail flow lanes: the same objects, one column for each place a configuration object acts, in processing order. A
// message is tracked exactly as on the Message path: the hits come from pathOverlay(), and the route joins the objects that
// acted on it in the order of "What happens, step by step".
// ---------------------------------------------------------------------------------------------------------------
// Columns in the order Exchange Online applies them, one column for each place a configuration object acts. Inbound
// and outbound differ: threat policies act both before the mail flow rules (malware) and after them (phish, spam,
// Safe Attachments, Safe Links), and outbound runs the other way round, from the sender's mailbox to the outside.
// The order matches the engine (lib/nexthop.js) so the route line only moves right.
export const INBOUND_LANES = [
  { id: 'sender', stop: 0, title: 'Outside sender', kinds: ['party'] },
  { id: 'door', stop: 1, title: 'Accepted domains', kinds: ['domain'] },
  { id: 'connection', stop: 2, title: 'Connectors, connection filter, advanced delivery', kinds: ['connector', 'connectionFilter', 'advancedDelivery', 'tenantAllowBlock'] },
  { id: 'malware', stop: 3, title: 'Anti-malware', kinds: ['antiMalware'] },
  { id: 'rules', stop: 4, title: 'Mail flow rules (priority order)', kinds: ['transportRule'] },
  { id: 'dlp', stop: 4, title: 'Data loss prevention', kinds: ['dlp'] },
  { id: 'spam', stop: 5, title: 'Anti-phishing, anti-spam, quarantine', kinds: ['antiPhish', 'antiSpam', 'quarantinePolicy'] },
  { id: 'after', stop: 6, title: 'Safe Attachments and Safe Links', kinds: ['safeAttachments', 'safeLinks'] },
  { id: 'journal', stop: 6, title: 'Journaling', kinds: ['journalRule', 'autoLabel', 'label'] },
  { id: 'mailbox', stop: 7, title: 'Recipient mailbox, inbox rules, retention', kinds: ['mailbox', 'group', 'inboxRule', 'externalTag', 'retention', 'mrmPolicy', 'ediscovery'] },
];
export const OUTBOUND_LANES = [
  { id: 'sender', stop: 0, title: 'Sender mailbox and groups', kinds: ['mailbox', 'group', 'inboxRule'] },
  { id: 'spam', stop: 1, title: 'Outbound spam', kinds: ['outbound'] },
  { id: 'malware', stop: 1, title: 'Anti-malware', kinds: ['antiMalware'] },
  { id: 'rules', stop: 2, title: 'Mail flow rules (priority order)', kinds: ['transportRule'] },
  { id: 'dlp', stop: 2, title: 'Data loss prevention and auto-labeling', kinds: ['dlp', 'autoLabel', 'label'] },
  { id: 'journal', stop: 2, title: 'Journaling', kinds: ['journalRule'] },
  { id: 'remote', stop: 3, title: 'Remote domains', kinds: ['remoteDomain'] },
  { id: 'dkim', stop: 4, title: 'DKIM signing', kinds: ['dkim', 'domain'] },
  { id: 'connector', stop: 4, title: 'Outbound connectors', kinds: ['connector'] },
  { id: 'destination', stop: 5, title: 'Outside recipient', kinds: ['party'] },
];
export const LANES = { inbound: INBOUND_LANES, outbound: OUTBOUND_LANES };

function lanesFor(stops, defs, extra = []) {
  const seen = new Set();
  const lanes = defs.map(l => ({ ...l, objects: [] }));
  const laneOf = kind => lanes.find(l => l.kinds.includes(kind)) || lanes[lanes.length - 1];
  for (const o of [...stops.flatMap(s => s.objects), ...extra]) {
    if (seen.has(o.key)) continue;
    seen.add(o.key);
    laneOf(o.kind).objects.push(o);
  }
  const rules = lanes.find(l => l.id === 'rules');
  if (rules) rules.objects.sort((a, b) => a.priority - b.priority);
  return lanes;
}

export function lanesModel(cfg) {
  const m = pathModel(cfg);
  // Quarantine policies decide where quarantined inbound mail goes and who may release it.
  const quarantine = items(cfg, 'quarantinePolicies').map(q => obj('quarantinePolicy', 'Quarantine policy', q));
  return { inbound: lanesFor(m.inbound, INBOUND_LANES, quarantine), outbound: lanesFor(m.outbound, OUTBOUND_LANES), path: m, mailbox: m.mailbox, sample: m.sample };
}

// The same tracking as the Message path, plus the route: one entry per object that acted, in step order.
export function lanesOverlay(lm, result) {
  const o = pathOverlay(lm.path, result);
  if (!o) return null;
  const lanes = lm[o.direction] || lm.inbound;
  const placed = new Map(lanes.flatMap((l, li) => l.objects.map(x => [x.key, { lane: li, object: x }])));
  // Each step's place on the Message path rail, so the route uses the step that belongs to an object's column: the
  // recipient mailbox is looked up at the front door as well as delivered to at the end, and the line meets it at the end.
  const stopAt = new Map();
  let at = 0;
  for (const step of result.steps || []) { at = stopOf(o.direction, step.component, at); stopAt.set(step.n, at); }
  const route = [...o.hits.entries()]
    .filter(([k]) => placed.has(k))
    .map(([key, h]) => {
      const { lane, object } = placed.get(key);
      const own = h.steps.filter(s => stopAt.get(s.n) >= lanes[lane].stop).map(s => s.n);
      return { key, first: own.length ? Math.min(...own) : h.steps.length ? null : Infinity, steps: h.steps.map(s => s.n), tone: h.tone, lane, name: object.name };
    })
    .filter(r => r.first !== null)
    .sort((a, b) => a.first - b.first || a.lane - b.lane);
  const unplaced = [...o.hits.entries()].filter(([k]) => !placed.has(k) && !k.startsWith('transportConfig:'))
    .map(([key, h]) => ({ key, name: nameFromSteps(result, key), steps: h.steps }));
  return { ...o, route, unplaced };
}

export function lanesText(lm, overlay) {
  if (!overlay) return '';
  const lanes = lm[overlay.direction] || lm.inbound;
  const lines = [`Mail flow lanes, ${overlay.direction}: ${overlay.outcome}`];
  for (const r of overlay.route) lines.push(`${Number.isFinite(r.first) ? `Step ${r.steps.join(', ')}` : 'Final'}: ${r.name} (${lanes[r.lane].title})`);
  return lines.join('\n');
}
