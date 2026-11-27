// The portal buttons for one object, its home portal first and highlighted, then the PowerShell that returns every
// setting of the object directly under them. The home portal is the service that stores the object; the others show
// a copy of some of its settings. Data comes from portalLinks() in lib/object-links.js.
import { portalLinks, linkTitle } from '/lib/object-links.js';

export function chipText(l, full = true) {
  const base = l.direct ? l.short : full ? `${l.short}: ${l.page}` : `${l.short}: find it here`;
  return l.home ? `Home: ${base}` : base;
}
export function chipClass(l) {
  return ['portal-chip', l.direct ? '' : 'find', l.home ? 'home' : ''].filter(Boolean).join(' ');
}

// el: the page's element builder. Returns { node, links } so a caller can tell whether anything was shown.
export function portalBlock(el, kind, obj = {}, { label = '', command = true } = {}) {
  const { links, note, command: cmd } = portalLinks(kind, obj);
  const wrap = el('div', { class: 'portal-block stack' });
  if (links.length) wrap.append(el('div', { class: 'portal-chips' }, ...(label ? [el('span', { class: 'walk-links-label', text: label })] : []),
    ...links.map(l => el('a', { class: chipClass(l), href: l.url, target: '_blank', rel: 'noopener noreferrer', title: `${linkTitle(l, obj.name || '')}${l.home ? '. This is where the object is stored; the other portals show some of its settings.' : ''}`, text: chipText(l) }))));
  else if (note) wrap.append(el('p', { class: 'muted', text: note }));
  if (command && cmd?.lines?.length) {
    wrap.append(el('div', { class: 'ps-block' },
      el('span', { class: 'ps-label', text: `Every setting, in ${cmd.shell}:` }),
      el('pre', { class: 'report-pre ps-pre', text: cmd.lines.join('\n') })));
  }
  return { node: wrap, links, command: cmd };
}
