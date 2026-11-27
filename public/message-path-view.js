// Troubleshoot > NextHop > Message path: the configuration drawn as the steps Exchange Online applies, inbound or
// outbound, with every object that acts at each step. After a prediction the path lights up: steps passed, the step
// where the message stopped, steps not reached, and the objects that acted on this message. Select any object for its
// configuration, what it did to this message, and the portals where it is changed. The model is lib/message-path.js.
import { pathModel, pathOverlay, pathText, lanesModel, lanesOverlay, lanesText } from '/lib/message-path.js';
import { portalBlock } from './portal-block.js';
import { openDetails } from './grid.js';

const TONE_WORD = { ok: 'Passed', info: 'Information', medium: 'Worth a look', high: 'Stopped or changed the message' };
const STATE_WORD = { passed: 'Passed', reached: 'Delivered', stopped: 'Stopped here', 'not-reached': 'Not reached' };
// Message path is hidden for now (2026-11-26): Mail flow lanes shows every object it did, in finer columns, with
// the route line, and now carries its per-step state too. Set SHOW_MESSAGE_PATH to true to bring the toggle back.
const SHOW_MESSAGE_PATH = false;
const view = { direction: 'inbound', mode: SHOW_MESSAGE_PATH ? 'path' : 'lanes' };

function fmt(v) {
  if (v === null || v === undefined || v === '') return '(blank)';
  if (Array.isArray(v)) return v.length ? v.map(x => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join('\n') : '(none)';
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export function messagePathPanel(ctx, cfg, result) {
  const { el, panel, h2, p, note, flash, busy } = ctx;
  const model = pathModel(cfg);
  const lanes = lanesModel(cfg);
  if (result) view.direction = result.direction === 'outbound' ? 'outbound' : 'inbound';
  const host = el('div', { class: 'stack' });

  function details(o, hit, stopTitle) {
    const kids = [];
    kids.push(el('p', { class: 'muted', text: `${o.type} · ${stopTitle}` }));
    const tags = el('div', { class: 'row mp-tags' });
    if (!o.synthetic) tags.append(el('span', { class: `mp-pill ${o.on ? 'ok' : 'off'}`, text: o.on ? 'Enabled' : 'Disabled' }));
    if (o.test) tags.append(el('span', { class: 'mp-pill warn', text: 'Test mode: reports, does not enforce' }));
    if (Number.isFinite(o.priority) && o.priority !== 9999) tags.append(el('span', { class: 'mp-pill info', text: `Priority ${o.priority}` }));
    if (hit) tags.append(el('span', { class: `mp-pill ${hit.tone === 'high' ? 'crit' : hit.tone === 'medium' ? 'warn' : 'info'}`, text: `Acted on this message: ${TONE_WORD[hit.tone] || 'Information'}` }));
    kids.push(tags);
    if (hit) {
      kids.push(el('h3', { text: 'What it did to this message' }));
      kids.push(el('ol', { class: 'mp-steps' }, ...hit.steps.map(s => el('li', {}, el('strong', { text: `Step ${s.n}, ${s.component}: ` }), s.text))));
    } else if (result) kids.push(note('This object did not act on the test message.'));
    if (!o.synthetic) {
      kids.push(el('h3', { text: 'Where it is stored, shown and changed' }));
      kids.push(note('The first button, marked Home, is the portal of the service that stores this object. Every portal page shows some of its settings, not all of them. The PowerShell under the buttons returns every setting; the Configuration table below is that read from the export.'));
      kids.push(portalBlock(el, o.kind, { name: o.name, type: o.type, id: o.item?.ExternalDirectoryObjectId || (o.kind === 'transportRule' ? o.item?.Guid : '') || '', upn: o.kind === 'mailbox' ? o.name : '' }).node);
      const rows = Object.entries(o.item || {}).filter(([k]) => !/^(PSComputerName|RunspaceId|PSShowComputerName)$/.test(k));
      if (rows.length) {
        kids.push(el('h3', { text: 'Configuration' }));
        kids.push(el('table', { class: 'mp-props' }, el('tbody', {}, ...rows.map(([k, v]) => el('tr', {}, el('th', { scope: 'row', text: k }), el('td', { text: fmt(v) }))))));
      }
    }
    openDetails(o.name, ...kids);
  }

  // One object as a button. Both views build chips the same way, so a message is tracked identically: lit in the
  // tone of what the object did, with its line numbers from "What happens, step by step".
  function chip(o, hit, overlay, where) {
    const cls = ['mp-chip', o.on ? '' : 'off', hit ? `hit ${hit.tone || 'info'}` : overlay ? 'quiet' : ''].filter(Boolean).join(' ');
    const label = `${o.type}: ${o.name}${o.on ? '' : ' (disabled)'}${o.test ? ' (test mode)' : ''}${hit ? `. Acted on this message at step ${hit.steps.map(x => x.n).join(', ')}` : ''}`;
    const node = el('button', { class: cls, type: 'button', title: label, 'aria-label': label, 'data-kind': o.kind, 'data-key': o.key },
      el('span', { class: 't', text: o.type }),
      el('span', { class: 'n', text: o.name }),
      el('span', { class: 'b' },
        o.on ? '' : el('span', { class: 'mp-flag', text: 'Off' }),
        o.test ? el('span', { class: 'mp-flag warn', text: 'Test' }) : '',
        hit ? el('span', { class: `mp-flag step ${hit.tone || 'info'}`, text: hit.steps.length ? hit.steps.map(x => x.n).join(', ') : 'End' }) : ''));
    node.addEventListener('click', () => details(o, hit, where));
    return node;
  }

  function summaryOf(overlay, what) {
    return overlay
      ? el('div', { class: { high: 'not-authorized', medium: 'callout warn', ok: 'callout ok' }[overlay.tone] || 'callout', role: 'status' },
        el('strong', { text: overlay.outcome }),
        p(`Lit objects acted on the test message; the number is its line in "What happens, step by step" below.${view.mode === 'lanes' ? ' The line joins them in that order.' : ''} Select any object for its settings.`))
      : p(what, 'muted');
  }

  function modeButtons() {
    const pathBtn = el('button', { class: view.mode === 'path' ? 'btn primary' : 'btn', type: 'button', 'aria-pressed': String(view.mode === 'path'), text: 'Message path' });
    const lanesBtn = el('button', { class: view.mode === 'lanes' ? 'btn primary' : 'btn', type: 'button', 'aria-pressed': String(view.mode === 'lanes'), text: 'Mail flow lanes' });
    const pick = (btn, mode) => btn.addEventListener('click', () => busy(btn, 'Drawing…', async () => { view.mode = mode; await new Promise(r => setTimeout(r, 120)); draw(); }));
    pick(pathBtn, 'path'); pick(lanesBtn, 'lanes');
    return SHOW_MESSAGE_PATH ? [pathBtn, lanesBtn] : [];
  }

  // Inbound or Outbound: both views show one direction at a time, in the order Exchange Online processes it.
  function directionButtons() {
    const inBtn = el('button', { class: view.direction === 'inbound' ? 'btn primary' : 'btn', type: 'button', 'aria-pressed': String(view.direction === 'inbound'), text: 'Inbound' });
    const outBtn = el('button', { class: view.direction === 'outbound' ? 'btn primary' : 'btn', type: 'button', 'aria-pressed': String(view.direction === 'outbound'), text: 'Outbound' });
    const pick = (btn, dir) => btn.addEventListener('click', () => busy(btn, 'Drawing…', async () => { view.direction = dir; await new Promise(r => setTimeout(r, 120)); draw(); }));
    pick(inBtn, 'inbound'); pick(outBtn, 'outbound');
    return [inBtn, outBtn];
  }

  function copyButton(text) {
    const copy = el('button', { class: 'btn', type: 'button', text: view.mode === 'lanes' ? 'Copy route as text' : 'Copy path as text' });
    copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(text); flash(copy, 'Copied'); } catch { flash(copy, 'Copy failed'); } });
    return copy;
  }

  function draw() {
    if (view.mode === 'lanes') drawLanes(); else drawPath();
  }

  function drawPath() {
    const overlay = result && (result.direction === 'outbound' ? 'outbound' : 'inbound') === view.direction ? pathOverlay(model, result) : null;
    const rail = model[view.direction];
    const tools = el('div', { class: 'row' }, ...modeButtons(), el('span', { class: 'mp-sep', 'aria-hidden': 'true' }), ...directionButtons());
    if (overlay) tools.append(copyButton(pathText(model, overlay)));
    const summary = summaryOf(overlay, result ? `The prediction is ${result.direction}. Choose ${result.direction === 'outbound' ? 'Outbound' : 'Inbound'} to see its path.` : 'Every object in this configuration, under the step where Exchange Online applies it, in order. Run "Predict mail flow" to light up the path one message takes.');

    const stops = el('ol', { class: `mp-rail ${view.direction}` }, ...rail.map((stop, i) => {
      const s = overlay?.stops[i];
      const objs = stop.objects.map(o => chip(o, overlay?.hits.get(o.key), overlay, `step "${stop.title}"`));
      return el('li', { class: `mp-stop ${s ? s.state : ''} ${s?.tone && s.state === 'stopped' ? s.tone : ''}` },
        el('span', { class: 'mp-dot', 'aria-hidden': 'true', text: String(i + 1) }),
        el('span', { class: 'mp-title', text: stop.title }),
        s ? el('span', { class: `mp-state ${s.state}`, text: STATE_WORD[s.state] }) : '',
        ...(objs.length ? objs : [el('span', { class: 'mp-none', text: 'Nothing configured' })]));
    }));
    const kids = [h2('Message path'), summary, tools, el('div', { class: 'mp-scroll' }, stops)];
    if (overlay?.unplaced.length) {
      kids.push(el('p', { class: 'muted', text: `Also used by this message (on the ${view.direction === 'inbound' ? 'outbound' : 'inbound'} path or organization-wide): ${overlay.unplaced.map(u => `${u.name} (step ${u.steps.map(x => x.n).join(', ')})`).join('; ')}.` }));
    }
    kids.push(note(model.sample ? 'Contoso sample topology (fictional). Rules are listed by priority. A rule shows on the inbound or outbound path from its sender and recipient scope; a rule without scope shows on both.' : 'Rules are listed by priority. A rule shows on the inbound or outbound path from its sender and recipient scope; a rule without scope shows on both.'));
    host.replaceChildren(panel(...kids));
  }

  // Mail flow lanes: one column for each place a configuration object acts, in the order Exchange Online applies
  // them for the chosen direction. After a prediction the same objects light up as on the Message path, and a line
  // joins them in step order, left to right.
  function drawLanes() {
    const overlay = result && (result.direction === 'outbound' ? 'outbound' : 'inbound') === view.direction ? lanesOverlay(lanes, result) : null;
    const cols = lanes[view.direction];
    const tools = el('div', { class: 'row' }, ...(SHOW_MESSAGE_PATH ? [...modeButtons(), el('span', { class: 'mp-sep', 'aria-hidden': 'true' })] : []), ...directionButtons());
    if (overlay) tools.append(copyButton(lanesText(lanes, overlay)));
    const summary = summaryOf(overlay, result ? `The prediction is ${result.direction}. Choose ${result.direction === 'outbound' ? 'Outbound' : 'Inbound'} to see its route.` : `Every place a configuration object acts on ${view.direction} mail, one column each, left to right in the order Exchange Online applies them. Run "Predict mail flow" to light up the objects one message touches and draw its route.`);
    // After a prediction each column says Passed, Stopped here, Delivered or Not reached (from the rail step it belongs to),
    // so you see where the message ended without the Message path.
    const grid = el('ol', { class: `ml-lanes ${view.direction}` }, ...cols.map((lane, i) => { const s = overlay?.stops?.[lane.stop]; return el('li', { class: `ml-lane ml-${lane.id} ${s ? `ml-state-${s.state}` : ''} ${s?.tone && s.state === 'stopped' ? s.tone : ''}` },
      el('span', { class: 'ml-title' }, el('span', { class: 'ml-num', text: String(i + 1) }), el('span', { text: lane.title }), s ? el('span', { class: `mp-state ${s.state}`, text: STATE_WORD[s.state] }) : ''),
      ...(lane.objects.length ? lane.objects.map(o => chip(o, overlay?.hits.get(o.key), overlay, `column "${lane.title}"`)) : [el('span', { class: 'mp-none', text: 'Nothing configured' })])); }));
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'ml-route');
    svg.setAttribute('aria-hidden', 'true');
    const stage = el('div', { class: 'ml-stage' }, grid, svg);
    const kids = [h2('Mail flow lanes'), summary, tools, el('div', { class: 'mp-scroll' }, stage)];
    if (overlay?.unplaced.length) kids.push(el('p', { class: 'muted', text: `Also used by this message (organization-wide or on the other direction): ${overlay.unplaced.map(u => `${u.name} (step ${u.steps.map(x => x.n).join(', ')})`).join('; ')}.` }));
    kids.push(note(`${model.sample ? 'Contoso sample topology (fictional). ' : ''}Columns run left to right in the order Exchange Online applies them. Rules are listed by priority. ${view.direction === 'inbound' ? 'Threat policies act twice inbound: malware before the mail flow rules, phishing and spam after them. The recipient mailbox is also looked up at the front door; the line meets it where the message is delivered.' : 'Outbound starts at the sender\'s mailbox and ends at the outside recipient; outbound spam and malware run before the mail flow rules, and DKIM signs the message before the outbound connector sends it.'}`));
    host.replaceChildren(panel(...kids));
    if (!overlay) return;
    const route = () => {
      if (!stage.isConnected) return;
      const box = stage.getBoundingClientRect();
      const pts = overlay.route.map(r => {
        const node = stage.querySelector(`[data-key="${CSS.escape(r.key)}"]`);
        if (!node) return null;
        const b = node.getBoundingClientRect();
        return { x: b.left - box.left + b.width / 2, y: b.top - box.top + b.height / 2, tone: r.tone };
      }).filter(Boolean);
      svg.setAttribute('width', String(stage.scrollWidth));
      svg.setAttribute('height', String(stage.scrollHeight));
      const parts = [];
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const mx = (a.x + b.x) / 2;
        parts.push(`<path class="ml-seg ${b.tone || 'info'}" d="M${a.x},${a.y} C${mx},${a.y} ${mx},${b.y} ${b.x},${b.y}"/>`);
      }
      svg.innerHTML = parts.join('');
    };
    requestAnimationFrame(route);
    if (typeof ResizeObserver === 'function') new ResizeObserver(route).observe(stage);
  }
  draw();
  return host;
}
