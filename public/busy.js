// Every button says it is doing something. Design rule for all 360 apps: a button that starts work shows a
// busy label at once ("Searching…", "Building…"), is disabled while it works, counts seconds after a short
// wait, and then shows the result or the error. Instant buttons flash what they did ("Copied", "Downloaded").

export async function busy(button, text, work) {
  if (!button || button.disabled) return undefined;
  const label = button.dataset.label || button.textContent;
  button.dataset.label = label;
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.classList.add('is-busy');
  button.textContent = text;
  const started = Date.now();
  const tick = setInterval(() => {
    const s = Math.round((Date.now() - started) / 1000);
    if (s >= 3) button.textContent = `${text} ${s} s`;
  }, 1000);
  try {
    return await work();
  } finally {
    clearInterval(tick);
    button.textContent = label;
    button.disabled = false;
    button.removeAttribute('aria-busy');
    button.classList.remove('is-busy');
    delete button.dataset.label;
  }
}

export function flash(button, text, ms = 1500) {
  if (!button) return;
  const label = button.dataset.flashLabel || button.textContent;
  button.dataset.flashLabel = label;
  button.textContent = text;
  button.classList.add('is-done');
  clearTimeout(button._flashTimer);
  button._flashTimer = setTimeout(() => {
    button.textContent = label;
    button.classList.remove('is-done');
    delete button.dataset.flashLabel;
  }, ms);
}

// A link that leaves the page (sign-in, sign-out): say where it is going while the browser loads it.
export function leaving(button, text) {
  if (!button) return;
  button.textContent = text;
  if (button.tagName === 'BUTTON') button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.classList.add('is-busy');
}

// The safety net for buttons whose result is instant (sort menus, collapse, theme): a visible press.
export function installPressFeedback(doc) {
  doc.addEventListener('click', event => {
    const target = event.target.closest?.('button, a.btn');
    if (!target || target.classList.contains('is-busy')) return;
    target.classList.add('pressed');
    setTimeout(() => target.classList.remove('pressed'), 250);
    // Links styled as buttons: a sign-in link leaves the page, a portal link opens a new tab. Say so.
    if (target.tagName === 'A') {
      const href = target.getAttribute('href') || '';
      if (/^\/auth\//.test(href)) leaving(target, /logout/.test(href) ? 'Signing out…' : 'Opening sign-in…');
      else if (target.target === '_blank') flash(target, 'Opened in a new tab');
    }
  }, true);
}
