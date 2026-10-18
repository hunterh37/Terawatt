// Shared UI helpers: number formatting, DOM builders, and the source popover.
// Importing this module touches no DOM, so node tests can import fmt.

const n0 = (x, d = 0) => Number(x).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const ok = (x) => x != null && Number.isFinite(Number(x));
const NA = 'n/a';

/** Formatters. Every one returns a string and shows 'n/a' for null or non-finite input. */
export const fmt = {
  num: (x, d = 0) => (ok(x) ? n0(x, d) : NA),
  /** Compact count: 1.2k, 3.4M, 5.6B, 7.8T. */
  short(x, d = 1) {
    if (!ok(x)) return NA;
    const a = Math.abs(x);
    const f = (v) => v.toFixed(d).replace(/\.0+$/, '');
    if (a >= 1e12) return `${f(x / 1e12)}T`;
    if (a >= 1e9) return `${f(x / 1e9)}B`;
    if (a >= 1e6) return `${f(x / 1e6)}M`;
    if (a >= 1e4) return `${f(x / 1e3)}k`;
    return n0(x, a < 10 && x % 1 ? 1 : 0);
  },
  /** Input in MW. */
  mw(x) {
    if (!ok(x)) return NA;
    if (Math.abs(x) >= 1000) return `${(x / 1000).toFixed(2)} GW`;
    if (Math.abs(x) >= 10) return `${n0(x)} MW`;
    if (Math.abs(x) >= 1) return `${x.toFixed(1)} MW`;
    return `${n0(x * 1000)} kW`;
  },
  /** Input in kW. */
  kw: (x) => (!ok(x) ? NA : Math.abs(x) >= 1000 ? `${(x / 1000).toFixed(2)} MW` : `${n0(x, Math.abs(x) < 10 ? 1 : 0)} kW`),
  /** Input in W. */
  w: (x) => (!ok(x) ? NA : Math.abs(x) >= 1000 ? `${(x / 1000).toFixed(1)} kW` : `${n0(x)} W`),
  /** Input in USD: $73.3B, $340M, $23.8M, $4.0k, $20. */
  usd(x, d = 1) {
    if (!ok(x)) return NA;
    const s = x < 0 ? '-' : '', a = Math.abs(x);
    if (a >= 1e12) return `${s}$${(a / 1e12).toFixed(d)}T`;
    if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(d)}B`;
    if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(d)}M`;
    if (a >= 1e4) return `${s}$${(a / 1e3).toFixed(d)}k`;
    return `${s}$${n0(a, a < 100 ? 2 : 0)}`;
  },
  /** Input is a share (0.64 -> '64%'). */
  pct: (x, d = 0) => (ok(x) ? `${(x * 100).toFixed(d)}%` : NA),
  tokS: (x) => (ok(x) ? `${fmt.short(x)} tok/s` : NA),
  /** Joules, with Wh for big values. */
  j: (x) => (!ok(x) ? NA : x >= 3600 ? `${(x / 3600).toFixed(1)} Wh` : `${x < 10 ? x.toFixed(2) : n0(x)} J`),
  /** Input in ms. */
  ms: (x) => (!ok(x) ? NA : x >= 60000 ? `${Math.round(x / 60000)} min` : x >= 1000 ? `${(x / 1000).toFixed(1)} s` : `${n0(x)} ms`),
  /** Input in tonnes. */
  t: (x) => (!ok(x) ? NA : Math.abs(x) >= 1e6 ? `${(x / 1e6).toFixed(2)} Mt` : `${n0(x)} t`),
  /** Input in megalitres. */
  ml: (x) => (ok(x) ? `${n0(x)} ML` : NA),
  c: (x) => (ok(x) ? `${x.toFixed(1)} C` : NA),
  years: (x) => (ok(x) ? `${x.toFixed(1)} yr` : 'never'),
};

/** Tiny DOM builder: el('div', { class: 'x', onclick: fn }, 'text', child). */
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'html') node.innerHTML = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return node;
}

/** Small "i" button that opens the source popover for a SOURCES id. */
export function sourceBadge(sourceId) {
  return el('button', { class: 'src-badge', type: 'button', 'data-src': sourceId, 'aria-label': `Source: ${sourceId}`, title: 'Where this number comes from' }, 'i');
}

/** One readout row: label, value + unit, source badge. */
export function readoutRow({ label, value, unit, sourceId }) {
  return el('div', { class: 'ro-row' },
    el('span', { class: 'ro-label' }, label),
    el('span', { class: 'ro-value' }, value, unit ? el('span', { class: 'ro-unit' }, ` ${unit}`) : null),
    sourceId ? sourceBadge(sourceId) : null);
}

const KIND_TITLE = { slide: 'Challenge slides', spec: 'Rack to the Future spec', team: 'Terawatt app engine', external: 'Published source',
  cleanview: 'Cleanview', derived: 'Computed here', assumption: 'Our assumption', unknown: 'Unknown' };

/**
 * Installs one document-level handler: any click on [data-src] opens a popover with the source's
 * label, reference, link, quote and (for assumptions) why. Call once from main.js.
 */
export function installSourcePopover(sources) {
  let pop = document.getElementById('src-pop');
  if (!pop) { pop = el('div', { id: 'src-pop', role: 'dialog', 'aria-live': 'polite', hidden: true }); document.body.append(pop); }
  const close = () => { pop.hidden = true; };
  document.addEventListener('click', (e) => {
    const t = e.target.closest && e.target.closest('[data-src]');
    if (!t) { if (!pop.contains(e.target)) close(); return; }
    e.preventDefault(); e.stopPropagation();
    const id = t.getAttribute('data-src'), s = sources[id] || { kind: 'unknown', label: `Unknown source id: ${id}` };
    pop.replaceChildren(
      el('div', { class: 'src-kind' }, KIND_TITLE[s.kind] || s.kind, el('code', {}, ` ${id}`)),
      el('div', { class: 'src-label' }, s.label || ''),
      s.quote ? el('blockquote', {}, s.quote) : null,
      s.why ? el('div', { class: 'src-why' }, `Why: ${s.why}`) : null,
      s.ref ? el('div', { class: 'src-ref' }, s.ref) : null,
      s.url ? el('a', { href: s.url, target: '_blank', rel: 'noopener' }, 'Open source') : null,
      el('button', { class: 'src-close', type: 'button', onclick: close, 'aria-label': 'Close' }, 'Close'));
    const r = t.getBoundingClientRect();
    pop.hidden = false;
    const w = Math.min(340, window.innerWidth - 24);
    pop.style.width = `${w}px`;
    pop.style.left = `${Math.max(12, Math.min(window.innerWidth - w - 12, r.left - w / 2))}px`;
    pop.style.top = `${Math.min(window.innerHeight - 40, r.bottom + 8)}px`;
  }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
}
