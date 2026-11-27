// Organization > Auditing/Logging > Config snapshots. One click saves the read-only mail flow configuration
// (the same Get- reads as export/Export-MailFlowConfig.ps1) as a JSON file in the snapshots folder on your PC.
// The list shows every snapshot and every export file; Compare shows what was added, removed or changed between two.
// Nothing is written to the tenant. The comparison engine is lib/snapshot-diff.js.
import { IGNORED_PROPERTIES } from '/lib/snapshot-diff.js';
import { openDetails } from './grid.js';

const DASH = '—';
const SOURCE_WORDS = { snapshot: 'Snapshot (this PC)', export: 'Export file', snapshotStore: 'Snapshot store' };
const STATUS_WORDS = { ok: 'Read', empty: 'Read, none configured', error: 'Error', unavailable: 'Not available', skipped: 'Skipped', missing: 'Not in the file' };
// Kept for the visit, so leaving the page and coming back keeps the last comparison.
const view = { before: '', after: '', diff: null, timer: 0, startedHere: false };

function when(iso) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return { show: DASH, text: '', sort: '' };
  const d = new Date(t);
  return { show: d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }), text: d.toLocaleString(), sort: d.toISOString() };
}
function nameOf(s) { return s.label ? `${s.label} (${s.name})` : s.name; }
function short(textValue, limit = 400) {
  const t = String(textValue ?? '');
  return t.length > limit ? `${t.slice(0, limit)}…` : t;
}

async function getJson(url, options) {
  const res = await fetch(url, { headers: { accept: 'application/json', ...(options?.headers || {}) }, ...options });
  return res.json();
}

export function renderSnapshots(ctx) {
  const { el, panel, h2, p, note, table, busy, pageEl, session = {} } = ctx;
  const root = el('div', { class: 'stack' });
  pageEl.replaceChildren(root);
  const openPane = section => { if (section.classList.contains('folded')) section.querySelector('.pane-fold')?.click(); };

  // Each pane keeps its heading (with Expand/Collapse and the portal link); only its body is redrawn.
  const takeBody = el('div', { class: 'stack' });
  const listBody = el('div', { class: 'stack' });
  const compareBody = el('div', { class: 'stack' });
  const takePane = panel(h2('Take a snapshot'), takeBody);
  const listPane = panel(h2('Snapshots'), listBody);
  const comparePane = panel(h2('Compare two snapshots'), compareBody);
  root.append(
    p('A snapshot is a copy of every Exchange Online and Purview setting that can change what happens to a message, saved as one file on your PC. Take one before and after a change, or on a schedule you keep, then compare any two to see exactly what was added, removed or changed.'),
    takePane, listPane, comparePane);

  // ---------------------------------------------------------------- Take a snapshot
  function drawTake(data) {
    const kids = [];
    const inSnapshotStore = data?.store === 'snapshotStore';
    kids.push(p(inSnapshotStore
      ? 'Exchange 360 runs the same read-only Get- reads as the mail flow export, with your own sign-in, and sends the result to your snapshot store, which checks your role and keeps it. Nothing in the tenant is changed and nothing is kept on this PC. Secrets are removed, and a snapshot that still contains text shaped like a secret is refused and never stored.'
      : 'Exchange 360 runs the same read-only Get- reads as the mail flow export, with your own sign-in, and saves the result in the snapshots folder. Nothing in the tenant is changed. Secrets are removed, and a snapshot that still contains text shaped like a secret is refused and never written.'));
    kids.push(el('p', {}, el('strong', { text: 'Saved to: ' }), el('code', { text: inSnapshotStore ? `Snapshot store (${data.snapshotStore?.url || ''})` : (data?.folder || '%USERPROFILE%\\Ex360-snapshots') })));
    if (data?.snapshotStore?.problem) kids.push(el('div', { class: 'callout warn', role: 'status' }, el('strong', { text: 'The snapshot store is not set up' }), p(data.snapshotStore.problem)));
    if (!data?.signedIn) {
      kids.push(el('div', { class: 'callout', role: 'status' }, el('strong', { text: 'Sign in to take a snapshot' }), p('Use Sign in (top right). You can still list and compare snapshots you already have without signing in.')));
      takeBody.replaceChildren(...kids);
      return;
    }
    if (!data.exchange) kids.push(el('div', { class: 'not-authorized', role: 'status' }, el('strong', { text: 'Exchange is not connected' }), p('A snapshot reads Exchange Online with your Exchange sign-in. Use Connect everything (top right), then come back.')));
    const label = el('input', { id: 'snap-label', type: 'text', maxlength: '120', autocomplete: 'off', placeholder: 'For example: Before the DMARC change' });
    const start = el('button', { class: 'btn primary', type: 'button', text: 'Take snapshot' });
    start.disabled = !data.exchange;
    const progress = el('div', { class: 'stack', role: 'status', 'aria-live': 'polite' });
    kids.push(el('div', { class: 'form-rows' },
      el('div', { class: 'form-row' },
        el('label', { class: 'form-label', for: 'snap-label' }, el('span', { text: 'Label (optional)' }), el('span', { class: 'form-hint', text: 'Shown in the list so you know why you took it' })),
        el('div', { class: 'form-control' }, label))));
    kids.push(el('div', { class: 'row' }, start));
    kids.push(progress);
    if (!data.compliance) kids.push(note('Compliance PowerShell is not connected, so the Purview sections (DLP, labels, retention) will be recorded as Skipped. Use Connect everything first to include them.'));
    takeBody.replaceChildren(...kids);
    const show = job => {
      const st = job || {};
      if (st.state === 'running') {
        start.disabled = true;
        const total = st.total || 0;
        progress.replaceChildren(
          el('strong', { text: `Taking a snapshot: ${st.sections || 0}${total ? ` of ${total}` : ''} sections read` }),
          el('progress', { max: String(total || 1), value: String(Math.min(st.sections || 0, total || 1)) }),
          p(st.step || 'Starting…', 'muted'),
          note('This takes a minute or two. You can leave this page; the snapshot keeps going and appears in the list when it is saved.'));
      } else {
        start.disabled = !data.exchange;
        if (st.state === 'error') progress.replaceChildren(el('div', { class: 'not-authorized', role: 'alert' }, el('strong', { text: 'The snapshot was not saved' }), p(st.message || 'No detail was returned.')));
        else if (st.state === 'done') progress.replaceChildren(el('div', { class: 'callout ok', role: 'status' }, el('strong', { text: 'Snapshot saved' }), p(st.message || '')));
        else progress.replaceChildren();
      }
    };
    start.addEventListener('click', () => busy(start, 'Starting snapshot…', async () => {
      const job = await getJson('/api/snapshots/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ label: label.value.trim() }) });
      view.startedHere = true;
      show(job);
      if (job.state === 'running') poll(show);
    }));
    show(data.job);
    if (data.job?.state === 'running') poll(show);
  }

  function poll(show) {
    clearTimeout(view.timer);
    view.timer = setTimeout(async () => {
      if (!root.isConnected) return;
      let data;
      try { data = await getJson('/api/snapshots'); } catch { poll(show); return; }
      show(data.job);
      if (data.job?.state === 'running') { poll(show); return; }
      // Finished: refresh the list, and pre-select the new snapshot as "After".
      if (data.job?.state === 'done' && data.job.id) view.after = data.job.id;
      drawList(data);
      drawPickers(data);
    }, 2000);
  }

  // ---------------------------------------------------------------- Snapshots list
  function drawList(data) {
    const kids = [];
    for (const problem of data.problems || []) kids.push(el('div', { class: 'callout warn', role: 'status' }, el('strong', { text: 'Folder problem' }), p(problem)));
    const rows = data.value || [];
    if (!rows.length) {
      kids.push(note(`No snapshots yet. Take one above. Export files saved by export/Export-MailFlowConfig.ps1 in %USERPROFILE%\\Ex360-exports are listed here too.${data.store === 'snapshotStore' ? ' Snapshots in the snapshot store appear after you sign in.' : ''}`));
    } else {
      kids.push(table(
        ['Name', 'Taken', 'Taken by', 'Organization', 'Source', 'Sections', 'With settings', 'Not read'],
        rows.map(s => [nameOf(s), when(s.takenAt), s.takenBy || DASH, s.organization || DASH, SOURCE_WORDS[s.source] || s.source, { show: String(s.sections), text: String(s.sections), sort: s.sections }, { show: String(s.ok), text: String(s.ok), sort: s.ok }, { show: String(s.notRead), text: String(s.notRead), sort: s.notRead }]),
        {
          search: rows.length > 5,
          searchLabel: 'Search snapshots',
          countLabel: ['snapshot', 'snapshots'],
          rowLabel: i => `Open ${rows[i].name}`,
          onRowClick: i => {
            const s = rows[i];
            const dl = el('a', { class: 'btn primary', href: `/api/snapshots/file?id=${encodeURIComponent(s.id)}`, download: s.name, text: 'Download (.json)' });
            dl.addEventListener('click', () => { const t = dl.textContent; dl.textContent = 'Download started'; setTimeout(() => { dl.textContent = t; }, 1500); });
            const asBefore = el('button', { class: 'btn', type: 'button', text: 'Compare: use as Before' });
            const asAfter = el('button', { class: 'btn', type: 'button', text: 'Compare: use as After' });
            asBefore.addEventListener('click', () => { view.before = s.id; drawPickers(data); asBefore.textContent = 'Set as Before'; });
            asAfter.addEventListener('click', () => { view.after = s.id; drawPickers(data); asAfter.textContent = 'Set as After'; });
            openDetails(nameOf(s),
              table(['Setting', 'Value'], [
                ['File', s.name], ['Label', s.label || DASH], ['Taken', when(s.takenAt).show], ['Taken by', s.takenBy || DASH],
                ['Organization', s.organization || DASH], ['Tenant ID', s.tenantId || DASH], ['Mailbox read', s.mailbox || DASH],
                ['Source', SOURCE_WORDS[s.source] || s.source], ['Sections', String(s.sections)], ['With settings', String(s.ok)],
                ['Read, none configured', String(s.empty)], ['Not read', String(s.notRead)], ['Size', `${Math.max(1, Math.round(s.bytes / 1024))} KB`],
              ]),
              el('div', { class: 'row' }, dl, asBefore, asAfter));
          },
        }));
      if (data.skipped) kids.push(note(`${data.skipped} other .json ${data.skipped === 1 ? 'file is' : 'files are'} in the folder but ${data.skipped === 1 ? 'is not a snapshot' : 'are not snapshots'}, so ${data.skipped === 1 ? 'it is' : 'they are'} not listed.`));
    }
    listBody.replaceChildren(...kids);
  }

  // ---------------------------------------------------------------- Compare
  const result = el('div', { class: 'stack' });
  function drawPickers(data) {
    const rows = data.value || [];
    if (rows.length < 2) {
      compareBody.replaceChildren(note('Take at least two snapshots, then pick a Before and an After here.'));
      return;
    }
    const ids = new Set(rows.map(r => r.id));
    if (!ids.has(view.after)) view.after = rows[0].id;
    if (!ids.has(view.before) || view.before === view.after) view.before = (rows.find(r => r.id !== view.after) || rows[1]).id;
    const option = (s, chosen) => el('option', { value: s.id, selected: s.id === chosen ? 'selected' : null, text: `${when(s.takenAt).show} · ${nameOf(s)}` });
    const before = el('select', { id: 'snap-before' }, ...rows.map(s => option(s, view.before)));
    const after = el('select', { id: 'snap-after' }, ...rows.map(s => option(s, view.after)));
    before.value = view.before;
    after.value = view.after;
    before.addEventListener('change', () => { view.before = before.value; });
    after.addEventListener('change', () => { view.after = after.value; });
    const go = el('button', { class: 'btn primary', type: 'button', text: 'Compare' });
    const swap = el('button', { class: 'btn', type: 'button', text: 'Swap Before and After' });
    swap.addEventListener('click', () => { [view.before, view.after] = [view.after, view.before]; before.value = view.before; after.value = view.after; swap.textContent = 'Swapped'; setTimeout(() => { swap.textContent = 'Swap Before and After'; }, 1500); });
    go.addEventListener('click', () => busy(go, 'Comparing…', async () => {
      if (view.before === view.after) { result.replaceChildren(el('div', { class: 'callout warn', role: 'alert' }, el('strong', { text: 'Pick two different snapshots' }), p('Before and After are the same file.'))); return; }
      view.diff = await getJson(`/api/snapshots/diff?a=${encodeURIComponent(view.before)}&b=${encodeURIComponent(view.after)}`);
      drawDiff({ justCompared: true });
    }));
    compareBody.replaceChildren(
      el('div', { class: 'form-rows' },
        el('div', { class: 'form-row' }, el('label', { class: 'form-label', for: 'snap-before' }, el('span', { text: 'Before' }), el('span', { class: 'form-hint', text: 'The older snapshot' })), el('div', { class: 'form-control' }, before)),
        el('div', { class: 'form-row' }, el('label', { class: 'form-label', for: 'snap-after' }, el('span', { text: 'After' }), el('span', { class: 'form-hint', text: 'The newer snapshot' })), el('div', { class: 'form-control' }, after))),
      el('div', { class: 'row' }, go, swap),
      result);
    if (view.diff) drawDiff();
  }

  function openObject(section, o) {
    openDetails(`${o.change}: ${o.name}`,
      p(`${section.title}. Matched by ${section.matchedBy === 'position' ? 'position in the list (the objects have no unique name or ID)' : section.matchedBy}: ${o.key}.`, 'muted'),
      table(['Property', 'Before', 'After'], o.changes.map(c => [c.property, short(c.before) || DASH, short(c.after) || DASH]), { countLabel: ['property', 'properties'] }));
  }

  // The pane opens to show a comparison you just asked for. Coming back to the page, it starts collapsed like every pane.
  function drawDiff({ justCompared = false } = {}) {
    const d = view.diff;
    if (justCompared) openPane(comparePane);
    if (!d?.ok) { result.replaceChildren(el('div', { class: 'not-authorized', role: 'alert' }, el('strong', { text: 'The comparison could not run' }), p(d?.message || 'No detail was returned.'))); return; }
    const t = d.totals;
    const kids = [];
    const otherTenant = d.before.tenantId && d.after.tenantId && d.before.tenantId !== d.after.tenantId;
    if (otherTenant) kids.push(el('div', { class: 'callout warn', role: 'status' }, el('strong', { text: 'These snapshots are from different tenants' }), p(`Before is ${d.before.organization || d.before.tenantId}; After is ${d.after.organization || d.after.tenantId}. Most objects will show as added or removed.`)));
    const nothing = !t.added && !t.removed && !t.changed && !t.notComparable;
    kids.push(el('div', { class: nothing ? 'callout ok' : 'callout', role: 'status' },
      el('strong', { text: nothing ? 'No configuration changes' : `${t.changedSections} of ${t.sections} sections differ: ${t.added} added, ${t.removed} removed, ${t.changed} changed` }),
      p(`Before: ${when(d.before.takenAt).show} (${d.beforeName}). After: ${when(d.after.takenAt).show} (${d.afterName}).`)));

    const differing = d.sections.filter(s => s.added || s.removed || s.changed || !s.comparable);
    if (differing.length) {
      kids.push(el('h3', { text: 'Sections that differ' }));
      // Each section folds open to show its own objects (2026-11-26). The flat objects table below stays for now.
      kids.push(table(['Section', 'Added', 'Removed', 'Changed', 'Before', 'After'],
        differing.map(s => [s.title, { show: String(s.added), text: String(s.added), sort: s.added }, { show: String(s.removed), text: String(s.removed), sort: s.removed }, { show: String(s.changed), text: String(s.changed), sort: s.changed }, STATUS_WORDS[s.statusBefore] || s.statusBefore, STATUS_WORDS[s.statusAfter] || s.statusAfter]),
        {
          countLabel: ['section', 'sections'],
          childLabel: 'objects',
          rowChildren: i => {
            const section = differing[i];
            if (!section.objects.length) return null;
            return table(['Name', 'Change', 'Properties'],
              section.objects.map(o => [o.name, o.change, { show: String(o.changes.length), text: String(o.changes.length), sort: o.changes.length }]),
              { search: section.objects.length > 5, searchLabel: `Search ${section.title}`, countLabel: ['object', 'objects'], rowLabel: j => `Open ${section.objects[j].name}`, onRowClick: j => openObject(section, section.objects[j]) });
          },
        }));
      const notRead = differing.filter(s => !s.comparable);
      if (notRead.length) kids.push(note(`${notRead.length} ${notRead.length === 1 ? 'section was' : 'sections were'} not read in one of the snapshots, so ${notRead.length === 1 ? 'it' : 'they'} cannot be compared. Not read is not the same as nothing configured.`));

      const objects = [];
      for (const s of differing) for (const o of s.objects) objects.push({ section: s, o });
      if (objects.length) {
        kids.push(el('h3', { text: 'Objects added, removed or changed' }));
        kids.push(table(['Name', 'Section', 'Change', 'Properties'],
          objects.map(({ section, o }) => [o.name, section.title, o.change, { show: String(o.changes.length), text: String(o.changes.length), sort: o.changes.length }]),
          {
            search: objects.length > 5,
            searchLabel: 'Search objects',
            countLabel: ['object', 'objects'],
            rowLabel: i => `Open ${objects[i].o.name}`,
            onRowClick: i => openObject(objects[i].section, objects[i].o),
          }));
      }
    }
    kids.push(note(`${t.sections - differing.length} sections are the same. Values that change on their own are not compared: ${IGNORED_PROPERTIES.join(', ')}. The order of plain lists (for example IP ranges or domains) is ignored.`));
    result.replaceChildren(...kids);
  }

  // ---------------------------------------------------------------- Load
  listBody.append(el('p', { class: 'loading', role: 'status', text: 'Reading the snapshots folder…' }));
  getJson('/api/snapshots').then(data => {
    if (!root.isConnected) return;
    drawTake({ ...data, signedIn: data.signedIn && session.signedIn !== false });
    drawList(data);
    drawPickers(data);
  }).catch(error => {
    listBody.replaceChildren(el('div', { class: 'not-authorized', role: 'alert' }, el('strong', { text: 'The snapshots folder could not be read' }), p(String(error?.message || error))));
  });
  return root;
}
