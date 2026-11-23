// Runs before CSS so the first paint matches the stored (or OS) theme. No flash.
(function (root) {
  const KEY = 'ex360-theme';
  let theme = null;
  try { theme = root.localStorage.getItem(KEY); } catch { /* storage blocked */ }
  if (theme !== 'light' && theme !== 'dark') {
    try { theme = root.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; }
    catch { theme = 'light'; }
  }
  root.document.documentElement.dataset.theme = theme;
})(window);
