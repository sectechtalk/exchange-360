// Collapsible rail sections, shared by every 360 app. Each .nav-label heads the nav items that follow
// it until the next label. Which sections are closed is remembered per app under `key`.
export const NAV_COLLAPSE_KEY = 'ex360/nav/collapsed';

export function readCollapsed(storage, key = NAV_COLLAPSE_KEY) {
  try {
    const value = JSON.parse(storage?.getItem(key) || '[]');
    return Array.isArray(value) ? value.filter(item => typeof item === 'string') : [];
  } catch { return []; }
}

export function sectionKey(text) {
  return String(text || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function installNavSections(nav, storage, storageKey = NAV_COLLAPSE_KEY) {
  const collapsed = new Set(readCollapsed(storage, storageKey));
  const labels = [...nav.querySelectorAll('.nav-label')];
  const itemsOf = label => {
    const out = [];
    for (let el = label.nextElementSibling; el && !el.classList.contains('nav-label'); el = el.nextElementSibling) out.push(el);
    return out;
  };
  const save = () => { try { storage?.setItem(storageKey, JSON.stringify([...collapsed])); } catch { /* storage unavailable */ } };
  const apply = label => {
    const closed = collapsed.has(label.dataset.section);
    label.setAttribute('aria-expanded', String(!closed));
    label.title = `${closed ? 'Expand' : 'Collapse'} ${label.textContent.trim()}`;
    for (const el of itemsOf(label)) el.classList.toggle('nav-collapsed', closed);
  };
  for (const label of labels) {
    const key = label.dataset.section || sectionKey(label.textContent);
    label.dataset.section = key;
    const native = label.tagName === 'BUTTON';
    if (!native) { label.setAttribute('role', 'button'); label.tabIndex = 0; }
    if (!label.querySelector('.nav-chevron')) label.insertAdjacentHTML('beforeend', '<span class="nav-chevron" aria-hidden="true"></span>');
    const toggle = () => { if (collapsed.has(key)) collapsed.delete(key); else collapsed.add(key); apply(label); save(); };
    label.addEventListener('click', toggle);
    if (!native) label.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle(); } });
    apply(label);
  }
  // Sub-groups inside a section (Organization > Compliance): a .nav-group button heads the .nav-child links
  // right after it. They use their own class so opening the section never reopens a closed group.
  const groups = [...nav.querySelectorAll('.nav-group')];
  const childrenOf = group => {
    const out = [];
    for (let el = group.nextElementSibling; el && el.classList.contains('nav-child'); el = el.nextElementSibling) out.push(el);
    return out;
  };
  const groupKey = group => `group:${group.dataset.group || sectionKey(group.textContent)}`;
  const applyGroup = group => {
    const closed = collapsed.has(groupKey(group));
    group.setAttribute('aria-expanded', String(!closed));
    group.title = `${closed ? 'Expand' : 'Collapse'} ${group.textContent.trim()}`;
    for (const el of childrenOf(group)) el.classList.toggle('nav-group-collapsed', closed);
  };
  for (const group of groups) {
    const toggleGroup = () => { const k = groupKey(group); if (collapsed.has(k)) collapsed.delete(k); else collapsed.add(k); applyGroup(group); save(); };
    // A group that is also a page (Organization > Security policies): its name opens the page and shows the
    // pages under it; only the chevron folds them away.
    if (group.tagName === 'A') {
      group.addEventListener('click', event => {
        if (event.target.closest('.nav-chevron')) { event.preventDefault(); toggleGroup(); return; }
        const k = groupKey(group);
        if (collapsed.has(k)) { collapsed.delete(k); applyGroup(group); save(); }
      });
    } else group.addEventListener('click', toggleGroup);
    applyGroup(group);
  }
  const expandItem = item => {
    let el = item?.previousElementSibling;
    if (item?.classList.contains('nav-child')) {
      let g = el;
      while (g && !g.classList.contains('nav-group')) g = g.previousElementSibling;
      if (g && collapsed.has(groupKey(g))) { collapsed.delete(groupKey(g)); applyGroup(g); save(); }
    }
    while (el && !el.classList.contains('nav-label')) el = el.previousElementSibling;
    if (el && collapsed.has(el.dataset.section)) { collapsed.delete(el.dataset.section); apply(el); save(); }
  };
  return {
    expandFor: view => expandItem(nav.querySelector(`[data-view="${view}"]`)),
    expandItem,
  };
}
