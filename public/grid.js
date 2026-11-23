// Shared data table for every Ex360 page. Each column header is a button that opens a menu with
// "Sort A to Z", "Sort Z to A" and a search box for that column, the way the Microsoft admin portals'
// column menus work. Rows can open a details panel, like selecting a row in the portal. The look is Fluent DetailsList.
// The filtering and sorting helpers are pure so tests can run them without a browser.

// A cell is a string or number, a DOM node, or { show, text, sort } where show is what is drawn,
// text is what the search box matches, and sort is the value sorted on.
export function cellText(cell) {
  if (cell == null) return '';
  if (typeof cell === 'string' || typeof cell === 'number' || typeof cell === 'boolean') return String(cell);
  if (typeof cell === 'object' && 'text' in cell && cell.text != null) return String(cell.text);
  if (typeof cell === 'object' && cell.nodeType) return cell.textContent || '';
  if (typeof cell === 'object' && 'show' in cell) return cellText(cell.show);
  return String(cell);
}
export function cellSort(cell) {
  if (cell && typeof cell === 'object' && !cell.nodeType && 'sort' in cell && cell.sort != null) return cell.sort;
  return cellText(cell);
}
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
export function compareValues(a, b) {
  const blankA = a === '' || a == null || a === '—';
  const blankB = b === '' || b == null || b === '—';
  if (blankA || blankB) return blankA === blankB ? 0 : blankA ? 1 : -1; // blanks always last
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return collator.compare(String(a), String(b));
}
// view = { sort: { col, dir: 'asc'|'desc' } | null, filters: { [col]: text }, search: text }
// Returns the indexes of the rows to show, in order.
export function applyView(rows, view = {}) {
  const filters = Object.entries(view.filters || {}).filter(([, v]) => String(v || '').trim());
  const search = String(view.search || '').trim().toLowerCase();
  let out = rows.map((_, i) => i).filter(i => {
    const row = rows[i];
    for (const [col, text] of filters) if (!cellText(row[Number(col)]).toLowerCase().includes(String(text).trim().toLowerCase())) return false;
    if (search && !row.some(cell => cellText(cell).toLowerCase().includes(search))) return false;
    return true;
  });
  if (view.sort && view.sort.col != null) {
    const { col, dir } = view.sort;
    out = out.map((i, pos) => ({ i, pos })).sort((x, y) => {
      const a = cellSort(rows[x.i][col]);
      const b = cellSort(rows[y.i][col]);
      const blank = v => v === '' || v == null || v === '—';
      if (blank(a) || blank(b)) return compareValues(a, b) || x.pos - y.pos;
      return (dir === 'desc' ? -compareValues(a, b) : compareValues(a, b)) || x.pos - y.pos;
    }).map(x => x.i);
  }
  return out;
}

// ---- DOM. Only used in the browser.
function h(tag, props = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v == null ? '' : String(v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v != null && v !== false) node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids.flat()) if (kid != null) node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return node;
}
function drawCell(cell) {
  if (cell && typeof cell === 'object' && cell.nodeType) return cell;
  if (cell && typeof cell === 'object' && 'show' in cell) return drawCell(cell.show);
  return document.createTextNode(cellText(cell));
}

let openMenu = null;
function closeMenu() {
  if (!openMenu) return;
  const { menu, button } = openMenu;
  openMenu = null;
  menu.remove();
  button.setAttribute('aria-expanded', 'false');
}
if (typeof document !== 'undefined') {
  document.addEventListener('mousedown', event => { if (openMenu && !openMenu.menu.contains(event.target) && !openMenu.button.contains(event.target)) closeMenu(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && openMenu) { const b = openMenu.button; closeMenu(); b.focus(); } });
  window.addEventListener('resize', closeMenu);
  window.addEventListener('hashchange', closeMenu);
}

let tableCount = 0;
/**
 * dataTable({ columns, rows, onRowClick, rowLabel, search, searchLabel, caption, countLabel })
 * columns: header labels (an empty label gets no menu). rows: arrays of cells (see cellText).
 * onRowClick(index): makes each row open something, like the portal's details panel.
 * search: true adds one search box above the table that matches any column.
 */
export function dataTable({ columns, rows, onRowClick, rowLabel, search = false, searchLabel = 'Search', countLabel = ['item', 'items'], firstIsHeader = true, className = '' }) {
  const id = `grid-${++tableCount}`;
  const view = { sort: null, filters: {}, search: '' };
  const wrap = h('div', { class: `data-grid ${className}`.trim() });
  const bar = h('div', { class: 'grid-bar' });
  const count = h('span', { class: 'grid-count', role: 'status' });
  const clearAll = h('button', { type: 'button', class: 'btn sm', text: 'Clear sort and filters', disabled: true });
  const searchBox = search ? h('input', { type: 'search', class: 'grid-search', placeholder: searchLabel, 'aria-label': searchLabel }) : null;
  if (searchBox) searchBox.addEventListener('input', () => { view.search = searchBox.value; draw(); });
  bar.append(count, ...(searchBox ? [searchBox] : []), clearAll);
  const tableWrap = h('div', { class: 'table-wrap' });
  const t = h('table', { id });
  const headRow = h('tr');
  const heads = columns.map((label, col) => {
    const th = h('th', { scope: 'col' });
    if (!label) { headRow.append(th); return null; }
    const mark = h('span', { class: 'grid-mark', 'aria-hidden': 'true' });
    const button = h('button', { type: 'button', class: 'col-head', 'aria-haspopup': 'true', 'aria-expanded': 'false', title: `Sort or search ${label}` }, h('span', { text: label }), mark, h('span', { class: 'grid-caret', 'aria-hidden': 'true', text: '▾' }));
    button.addEventListener('click', () => toggleMenu(col, label, button));
    th.append(button);
    headRow.append(th);
    return { th, button, mark, label };
  });
  t.append(h('thead', {}, headRow));
  const body = h('tbody');
  t.append(body);
  tableWrap.append(t);
  // Short tables (a handful of rows, no search box) skip the count bar; each column menu still has its own Clear.
  if (rows.length >= 6 || search) wrap.append(bar);
  wrap.append(tableWrap);

  clearAll.addEventListener('click', () => {
    view.sort = null; view.filters = {}; view.search = '';
    if (searchBox) searchBox.value = '';
    closeMenu();
    draw();
  });

  function toggleMenu(col, label, button) {
    if (openMenu && openMenu.button === button) { closeMenu(); return; }
    closeMenu();
    const menu = h('div', { class: 'col-menu', role: 'dialog', 'aria-label': `${label} column` });
    const sortBtn = (dir, text) => {
      const on = view.sort && view.sort.col === col && view.sort.dir === dir;
      return h('button', { type: 'button', class: on ? 'btn sm primary' : 'btn sm', 'aria-pressed': on ? 'true' : 'false', text, onclick: () => { view.sort = on ? null : { col, dir }; draw(); closeMenu(); button.focus(); } });
    };
    const input = h('input', { type: 'search', placeholder: `Search ${label}`, 'aria-label': `Search ${label}`, value: view.filters[col] || '' });
    input.addEventListener('input', () => { view.filters[col] = input.value; draw(); });
    input.addEventListener('keydown', event => { if (event.key === 'Enter') { closeMenu(); button.focus(); } });
    const clear = h('button', { type: 'button', class: 'btn sm', text: 'Clear this column', disabled: !(view.filters[col] || (view.sort && view.sort.col === col)), onclick: () => { delete view.filters[col]; if (view.sort && view.sort.col === col) view.sort = null; draw(); closeMenu(); button.focus(); } });
    menu.append(sortBtn('asc', 'Sort A to Z'), sortBtn('desc', 'Sort Z to A'), h('label', { class: 'col-menu-label', text: 'Search this column' }), input, clear);
    document.body.append(menu);
    const r = button.getBoundingClientRect();
    const width = 240;
    menu.style.left = `${Math.max(8, Math.min(window.innerWidth - width - 8, r.left))}px`;
    menu.style.top = `${r.bottom + 4}px`;
    button.setAttribute('aria-expanded', 'true');
    openMenu = { menu, button };
    input.focus();
  }

  function draw() {
    const order = applyView(rows, view);
    body.replaceChildren();
    for (const i of order) {
      const row = rows[i];
      const tr = h('tr');
      row.forEach((cell, c) => tr.append(h(c === 0 && firstIsHeader ? 'th' : 'td', { scope: c === 0 && firstIsHeader ? 'row' : null }, drawCell(cell))));
      if (onRowClick) {
        tr.classList.add('clickable');
        tr.tabIndex = 0;
        tr.setAttribute('aria-label', rowLabel ? rowLabel(i) : `Open details for ${cellText(row[0])}`);
        // Selecting a row marks it the way the portal does, then opens its details.
        const select = () => { body.querySelectorAll('tr.is-selected').forEach(r => { r.classList.remove('is-selected'); r.removeAttribute('aria-selected'); }); tr.classList.add('is-selected'); tr.setAttribute('aria-selected', 'true'); onRowClick(i); };
        tr.addEventListener('click', event => { if (!event.target.closest('a,button,input')) select(); });
        tr.addEventListener('keydown', event => { if ((event.key === 'Enter' || event.key === ' ') && event.target === tr) { event.preventDefault(); select(); } });
      }
      body.append(tr);
    }
    if (!order.length) body.append(h('tr', {}, h('td', { colspan: columns.length, class: 'muted', text: rows.length ? 'Nothing matches the search. Use Clear sort and filters.' : 'No rows.' })));
    const [one, many] = countLabel;
    count.textContent = order.length === rows.length ? `${rows.length} ${rows.length === 1 ? one : many}` : `Showing ${order.length} of ${rows.length} ${many}`;
    heads.forEach((head, col) => {
      if (!head) return;
      const sorted = view.sort && view.sort.col === col ? view.sort.dir : null;
      const filtered = String(view.filters[col] || '').trim();
      head.mark.textContent = `${sorted === 'asc' ? '↑' : sorted === 'desc' ? '↓' : ''}${filtered ? ' ⧩' : ''}`;
      head.th.setAttribute('aria-sort', sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none');
      head.button.classList.toggle('active', Boolean(sorted || filtered));
      head.button.title = `Sort or search ${head.label}${sorted ? `. Sorted ${sorted === 'asc' ? 'A to Z' : 'Z to A'}` : ''}${filtered ? `. Filtered on "${filtered}"` : ''}`;
    });
    clearAll.disabled = !(view.sort || Object.values(view.filters).some(v => String(v || '').trim()) || String(view.search || '').trim());
  }
  draw();
  return wrap;
}

// A details panel that slides in from the right, like selecting a row in the Exchange admin center.
let openFlyout = null;
export function openDetails(title, ...content) {
  closeDetails();
  const back = h('div', { class: 'flyout-back', onclick: () => closeDetails() });
  const close = h('button', { type: 'button', class: 'btn', text: 'Close', onclick: () => closeDetails() });
  const panel = h('aside', { class: 'flyout', role: 'dialog', 'aria-modal': 'true', 'aria-label': title, tabindex: '-1' },
    h('div', { class: 'flyout-head' }, h('h2', { text: title }), close),
    h('div', { class: 'flyout-body stack' }, ...content));
  const returnTo = document.activeElement;
  const onKey = event => { if (event.key === 'Escape' && !openMenu) closeDetails(); };
  document.addEventListener('keydown', onKey);
  document.body.append(back, panel);
  openFlyout = { back, panel, onKey, returnTo };
  close.focus();
  return panel;
}
export function closeDetails() {
  if (!openFlyout) return;
  const { back, panel, onKey, returnTo } = openFlyout;
  openFlyout = null;
  document.removeEventListener('keydown', onKey);
  back.remove();
  panel.remove();
  if (returnTo && returnTo.isConnected && returnTo.focus) returnTo.focus();
}
if (typeof window !== 'undefined') window.addEventListener('hashchange', () => closeDetails());
