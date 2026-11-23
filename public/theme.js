// Theme: a stored choice ('light' | 'dark') wins; otherwise follow the OS (360 standard).
export const THEME_KEY = 'ex360-theme';

export function storedTheme(storage) {
  try {
    const v = storage && storage.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch { return null; }
}

export function osTheme(win) {
  try { return win && win.matchMedia && win.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; }
  catch { return 'light'; }
}

export function initialTheme(storage, win) { return storedTheme(storage) || osTheme(win); }

export function applyTheme(doc, theme) {
  doc.documentElement.dataset.theme = theme;
  const btn = doc.getElementById && doc.getElementById('theme-toggle');
  if (btn) {
    btn.setAttribute('aria-pressed', String(theme === 'dark'));
    const label = btn.querySelector('.theme-label');
    if (label) label.textContent = theme === 'dark' ? 'Light mode' : 'Dark mode';
  }
}

export function saveTheme(theme, storage) {
  try { storage && storage.setItem(THEME_KEY, theme); } catch { /* storage blocked */ }
}

export function toggleTheme(doc, storage) {
  const next = doc.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  saveTheme(next, storage);
  applyTheme(doc, next);
  return next;
}
