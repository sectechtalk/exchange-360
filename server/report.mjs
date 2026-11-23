// Gathers every read the single-mailbox report needs, as the signed-in person, then hands them to lib/report.js.
// Reads only: Graph GETs, one Exchange Online PowerShell session (mode "report") and one Security & Compliance
// session (mode "govern"). Nothing is written to disk; the finished report is kept in memory for 15 minutes so
// the PDF matches the page the person is looking at.
import { graphGet, graphList } from './graph.mjs';
import { runExo } from './exo.mjs';
import { signInsPath } from './live.mjs';
import { notAuthorized } from '../lib/permissions.js';
import { buildMailboxReport } from '../lib/report.js';
import { demoReportInput } from '../lib/demo-report.js';
import { demoMailbox } from '../lib/demo.js';

const KEEP_MS = 15 * 60 * 1000;
const cache = new Map();

export function validTimeZone(tz) {
  if (!tz || typeof tz !== 'string' || tz.length > 64) return 'UTC';
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } catch { return 'UTC'; }
}

function key(session, id, demo) { return `${demo ? 'demo' : session?.sid || 'none'}|${String(id).toLowerCase()}`; }

export function cachedReport(session, id, demo) {
  const hit = cache.get(key(session, id, demo));
  if (!hit || Date.now() - hit.at > KEEP_MS) return null;
  return hit.report;
}

function remember(session, id, demo, report) {
  for (const [k, v] of cache) if (Date.now() - v.at > KEEP_MS) cache.delete(k);
  cache.set(key(session, id, demo), { at: Date.now(), report });
}

async function gatherLive({ session, id, organization, identity }) {
  const graph = session.graph?.access_token;
  const enc = encodeURIComponent(id);
  const select = 'id,displayName,givenName,surname,userPrincipalName,mail,mailNickname,jobTitle,department,officeLocation,companyName,accountEnabled,usageLocation,createdDateTime,onPremisesSyncEnabled,proxyAddresses,userType,assignedLicenses,licenseAssignmentStates';
  const user = await graphGet(graph, `/users/${enc}?$select=${select}`, 'users');
  if (!user.ok) return { user };
  const upn = user.json.userPrincipalName;
  const address = user.json.mail || upn;
  const [licenses, groups, signIns, ca, alerts, exo, ipps] = await Promise.all([
    graphList(graph, `/users/${enc}/licenseDetails`, 'users'),
    graphList(graph, `/users/${enc}/transitiveMemberOf`, 'directory', 10),
    graphList(graph, signInsPath({ id: user.json.id, upn, top: 15 }), 'signins', 1),
    graphList(graph, '/identity/conditionalAccess/policies', 'policy'),
    graphList(graph, '/security/alerts_v2?$top=100', 'alerts', 1).then(res => {
      if (!res.ok) return res;
      const names = [upn, address].filter(Boolean).map(v => v.toLowerCase());
      return { ok: true, value: res.value.filter(a => names.some(n => JSON.stringify(a.evidence || []).toLowerCase().includes(n))) };
    }),
    session.exo?.access_token
      ? runExo({ token: session.exo.access_token, organization, mode: 'report', args: { identity: address, address }, timeoutMs: 240000, ...identity })
      : Promise.resolve(notAuthorized('exchange', 'Sign in to Exchange with the button at the top of the page.')),
    session.compliance?.access_token
      ? runExo({ token: session.compliance.access_token, organization, mode: 'govern', args: {}, timeoutMs: 180000, ...identity })
      : Promise.resolve(notAuthorized('ipps', 'Sign in to Compliance PowerShell with the button at the top of the page.')),
  ]);
  return { user, licenses, groups, signIns, ca, alerts, exo, ipps, address };
}

export async function buildReport({ session, id, demo, organization, identity, timeZone, fresh }) {
  const tz = validTimeZone(timeZone);
  if (!fresh) {
    const hit = cachedReport(session, id, demo);
    if (hit && hit.timeZone === tz) return hit;
  }
  let input;
  if (demo) {
    if (!demoMailbox(id)) return { ok: false, label: 'Could not read', message: 'No Contoso demo mailbox matches that name.' };
    input = demoReportInput(id);
  } else {
    if (!session?.graph?.access_token) return { ok: false, ...notAuthorized('users', 'Sign in first.') };
    const live = await gatherLive({ session, id, organization, identity });
    if (!live.user.ok) return live.user;
    input = {
      source: 'live',
      requested: id,
      signedInAs: identity.userPrincipalName || session.account?.username || '',
      graph: { user: live.user, licenses: live.licenses, groups: live.groups, signIns: live.signIns, ca: live.ca, alerts: live.alerts },
      exo: live.exo,
      ipps: live.ipps,
    };
  }
  const report = buildMailboxReport({ ...input, timeZone: tz, generatedAt: new Date().toISOString() });
  remember(session, id, demo, report);
  return report;
}
