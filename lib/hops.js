// Second sign-in hops. Graph is the first sign-in. These three are separate tokens.
import { isPage } from './pages.js';

const RESOURCES = new Set(['exchange', 'purview', 'compliance']);

export const HOPS = {
  exchange: {
    resource: 'exchange',
    button: 'Sign in for Exchange Online',
    unlocks: 'This sign-in unlocks Exchange Online configuration, message trace, migrations, role groups, and the admin audit log.',
  },
  purview: {
    resource: 'purview',
    button: 'Sign in for Purview reads',
    unlocks: 'This sign-in unlocks sensitivity labels, retention labels, eDiscovery, audit query results, and Defender XDR incidents and alerts.',
  },
  compliance: {
    resource: 'compliance',
    button: 'Sign in for compliance PowerShell',
    unlocks: 'This sign-in unlocks DLP policies, retention compliance policies, Purview role groups, and the unified audit search.',
  },
};

const BY_PERMISSION = new Map([
  ['Exchange.Manage', HOPS.exchange],
  ['InformationProtectionPolicy.Read', HOPS.purview],
  ['RecordsManagement.Read.All', HOPS.purview],
  ['eDiscovery.Read.All', HOPS.purview],
  ['AuditLogsQuery.Read.All', HOPS.purview],
  ['SecurityAlert.Read.All', HOPS.purview],
  ['SecurityIncident.Read.All', HOPS.purview],
  ['https://ps.compliance.protection.outlook.com/.default', HOPS.compliance],
]);

export function hopForPermission(permission) {
  return BY_PERMISSION.get(permission) || null;
}

export function safePage(value) {
  const id = String(value || '').replace(/^#/, '');
  return isPage(id) ? id : '';
}

export function safeChain(value) {
  const parts = Array.isArray(value) ? value : String(value || '').split(',');
  const out = [];
  for (const part of parts) {
    const id = String(part || '').trim();
    if (RESOURCES.has(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

export function loginPath({ resource = 'graph', returnTo = '', next = '', consent = false } = {}) {
  const q = new URLSearchParams();
  if (RESOURCES.has(resource)) q.set('resource', resource);
  const page = safePage(returnTo);
  if (page) q.set('return', page);
  const chain = safeChain(next);
  if (chain.length) q.set('next', chain.join(','));
  if (consent) q.set('consent', '1');
  const text = q.toString();
  return text ? `/auth/login?${text}` : '/auth/login';
}

// Connect everything: the server redeems what it can without a prompt, then hops only for the rest.
export function connectAllPath(returnTo = '') {
  const page = safePage(returnTo);
  return page ? `/auth/connect-all?return=${page}` : '/auth/connect-all';
}

export function callbackLocation({ returnTo, next } = {}) {
  const page = safePage(returnTo) || 'start';
  const chain = safeChain(next);
  if (!chain.length) return `/#${page}`;
  const q = new URLSearchParams({ resource: chain[0], return: page });
  if (chain.length > 1) q.set('next', chain.slice(1).join(','));
  return `/auth/login?${q}`;
}

export function remainingHops(connections) {
  return ['exchange', 'purview', 'compliance'].filter(id => !connections?.[id]);
}
