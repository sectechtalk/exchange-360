// Design rule for every 360 app: every button shows it is doing something.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { busy, flash } from '../public/busy.js';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
function fakeButton(text) {
  const classes = new Set();
  const attrs = {};
  return { textContent: text, disabled: false, dataset: {}, tagName: 'BUTTON', classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c) }, setAttribute: (k, v) => { attrs[k] = v; }, removeAttribute: k => { delete attrs[k]; }, attrs, classes };
}

test('busy() disables the button, shows the busy label, then restores it, even on error', async () => {
  const b = fakeButton('Search');
  let seen;
  const out = await busy(b, 'Searching…', async () => { seen = [b.textContent, b.disabled, b.attrs['aria-busy'], b.classes.has('is-busy')]; return 7; });
  assert.deepEqual(seen, ['Searching…', true, 'true', true]);
  assert.equal(out, 7);
  assert.deepEqual([b.textContent, b.disabled, b.attrs['aria-busy'], b.classes.has('is-busy')], ['Search', false, undefined, false]);
  await assert.rejects(busy(b, 'Searching…', async () => { throw new Error('boom'); }));
  assert.equal(b.textContent, 'Search');
  assert.equal(b.disabled, false);
  // A second click while busy does not start the work twice.
  b.disabled = true;
  assert.equal(await busy(b, 'Searching…', async () => 1), undefined);
});

test('flash() shows what an instant button did, then puts the label back', async () => {
  const b = fakeButton('Download');
  flash(b, 'Downloaded', 10);
  assert.equal(b.textContent, 'Downloaded');
  await new Promise(r => setTimeout(r, 30));
  assert.equal(b.textContent, 'Download');
});

test('every button that starts work in Ex360 uses busy(), and instant ones flash or redraw', () => {
  const app = read('public/app.js');
  for (const label of ['Running every check…', 'Checking DNS…', 'Reading quarantine…', 'Searching the audit log…', 'Reading the message…', 'Reading again…']) assert.ok(app.includes(`'${label}'`), label);
  assert.match(app, /busy\(button, 'Searching…', \(\) => searchRecipients/);
  assert.match(app, /busy\(form\.querySelector\('button\[type="submit"\]'\), 'Searching…'/);
  assert.equal((app.match(/onclick: e => busy\(e\.currentTarget, 'Searching…'/g) || []).length, 4, 'the four retry searches');
  assert.match(app, /flash\(download, 'Downloaded'\)/);
  assert.match(app, /flash\(e\.currentTarget, 'Loaded'\)/);
  assert.match(app, /leaving\(\$\('viewer-button'\)/);
  assert.doesNotMatch(app, /demo-toggle/, 'there is no demo switch in the app');
  assert.match(app, /installPressFeedback\(document\)/);
  // Every <button> built in app.js is one of these, so a new one fails here until it gets feedback.
  const built = (app.match(/el\('button'/g) || []).length;
  for (const label of ['Reading sign-ins…', 'Searching changes…']) assert.ok(app.includes(`'${label}'`), label);
  assert.match(app, /busy\(button, 'Searching…', async \(\) => \{\n      out\.replaceChildren\(el\('p', \{ class: 'loading', text: 'Reading recipients…'/);
  assert.equal(built, 22, 'a new button was added: give it busy(), flash() or an immediate redraw, then update this count');
  const css = read('public/styles.css');
  assert.match(css, /\.btn\.is-busy::before/);
  assert.match(css, /prefers-reduced-motion/);
});
