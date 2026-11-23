// A walkthrough: one plain line per step, in order, saying when it happened, which component touched
// the item, and what it did. Message trace uses it today; other 360 tools (for example a next-hop
// tracer) can build the same step list and reuse the text and page rendering.
//
// Step: { time, component, text, tone?, gapMs? }  tone is ok | info | medium | high.

export function formatClock(value) {
  const t = Date.parse(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(String(value || '')) ? `${value}Z` : String(value || ''));
  if (!Number.isFinite(t)) return '';
  return new Date(t).toISOString().slice(11, 19);
}

export function formatStepGap(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '';
  const s = Math.round(ms / 1000);
  if (s < 60) return `+${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `+${m} min${s % 60 ? ` ${s % 60} s` : ''}`;
  const h = Math.floor(m / 60);
  return `+${h} h${m % 60 ? ` ${m % 60} min` : ''}`;
}

// Number the steps and work out the time since the previous step.
export function numberSteps(steps) {
  let prev = NaN;
  return (steps || []).map((s, i) => {
    const t = Date.parse(/Z$|[+-]\d\d:?\d\d$/.test(String(s.time || '')) ? s.time : `${s.time}Z`);
    const gapMs = Number.isFinite(prev) && Number.isFinite(t) ? t - prev : NaN;
    if (Number.isFinite(t)) prev = t;
    return { ...s, n: i + 1, clock: formatClock(s.time), gapMs, gap: formatStepGap(gapMs) };
  });
}

// Plain text, one line per step, for copying into a ticket or chat:
// "1. 22:30:23  Exchange Online (SJ0P220MB0657)  Received from 2607:f8b0:4864:20::b131."
export function walkText(steps, { utcLabel = true } = {}) {
  const list = numberSteps(steps);
  const lines = list.map(s => `${s.n}. ${s.clock}${s.gap ? ` (${s.gap})` : ''}  ${s.component}  ${s.text}`);
  return utcLabel && lines.length ? ['Times are UTC.', ...lines].join('\n') : lines.join('\n');
}
