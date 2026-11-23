// Pages live in the URL (#domains). Back, refresh and shared links open the same page.
// The app keeps its own state; this module only reads and writes the hash.
export function viewFromHash(hash, isView) {
  const view = decodeURIComponent(String(hash || '').replace(/^#\/?/, '').split(/[/?]/)[0]);
  return view && isView(view) ? view : null;
}

export function tabFromHash(hash) {
  const tab = decodeURIComponent(String(hash || '').replace(/^#\/?/, '').split('?')[0].split('/')[1] || '');
  return /^[a-z0-9-]+$/.test(tab) ? tab : null;
}

export function queryFromHash(hash) {
  const q = String(hash || '').split('?')[1] || '';
  return Object.fromEntries(new URLSearchParams(q));
}

export function writeTab(view, tab, loc = location, hist = history) {
  const url = `${loc.pathname}${loc.search}#${encodeURIComponent(view)}${tab ? `/${encodeURIComponent(tab)}` : ''}`;
  if (`${loc.pathname}${loc.search}${loc.hash}` !== url) hist.replaceState(null, '', url);
}

export function writeView(view, loc = location, hist = history) {
  if (!view || viewFromHash(loc.hash, v => v === view)) return;
  const url = `${loc.pathname}${loc.search}#${encodeURIComponent(view)}`;
  if (loc.hash) hist.pushState(null, '', url); else hist.replaceState(null, '', url);
}

export function onViewChange(isView, onView, win = window) {
  const handler = () => { const view = viewFromHash(win.location.hash, isView); if (view) onView(view); };
  win.addEventListener('popstate', handler);
  win.addEventListener('hashchange', handler);
  return () => { win.removeEventListener('popstate', handler); win.removeEventListener('hashchange', handler); };
}
