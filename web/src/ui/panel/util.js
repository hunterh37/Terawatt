// Small helpers shared by the controls panel. Importing this file touches no DOM.

import { fmt } from '../common.js';

/** Decimal places implied by a slider step: 0.05 -> 2, 1 -> 0, 0.1e6 -> 0. */
export function decimalsOf(step) {
  const s = String(step);
  if (s.includes('e-')) return Number(s.split('e-')[1]) || 0;
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
}

/** Format a scenario value for display next to its slider, using the unit named in engine PARAMS. */
export function formatParam(p, v) {
  const n = Number(v);
  if (v == null || !Number.isFinite(n)) return 'n/a';
  const d = decimalsOf(p && p.step);
  switch (p && p.unit) {
    case 'USD': return fmt.usd(n, 0);
    case 'MW': return fmt.mw(n);
    case 'USD/kg': return `$${fmt.num(n)}/kg`;
    case 'USD/t': return `$${fmt.num(n)}/t`;
    case 'USD/MW': return `${fmt.usd(n)}/MW`;
    case 'USD/user/month': return `$${fmt.num(n)}/user/month`;
    case 'USD/M': return `$${fmt.num(n, d)} per M tokens`;
    case 'x': return `${fmt.num(n, 2)}x`;
    case '/yr': return `${fmt.pct(n, 1)}/yr`;
    case 'weight': return fmt.num(n, d);
    default: return p && p.unit ? `${fmt.num(n, d)} ${p.unit}` : fmt.num(n, d);
  }
}

const TEXT_INPUT_TYPES = ['text', 'number', 'search', 'email', 'url', 'password', 'tel'];

/** True when a key press should go to the control the user is typing in, not to our shortcuts. */
export function isTyping(target) {
  if (!target || !target.tagName) return false;
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  if (tag === 'INPUT') return TEXT_INPUT_TYPES.includes((target.type || 'text').toLowerCase());
  return false;
}

/**
 * Replace a container's children with the nodes build() returns (null entries are dropped), then put
 * keyboard focus back on the element that had it (matched by its data-key attribute) so a re-render
 * never drops the user's place.
 */
export function renderKeeping(container, build) {
  const active = document.activeElement;
  const key = active && container.contains(active) && active.getAttribute ? active.getAttribute('data-key') : null;
  container.replaceChildren(...build().filter(Boolean));
  if (!key) return;
  const sel = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(key) : key.replace(/[^\w-]/g, '\\$&');
  const next = container.querySelector(`[data-key="${sel}"]`);
  if (next && typeof next.focus === 'function') next.focus({ preventScroll: true });
}

/**
 * Coalesces slider input into one app.setParam per animation frame per path, so dragging feels live
 * without re-running the engine more than once per frame. Selects and toggles use now() instead.
 */
export function createParamQueue(app) {
  const pending = new Map();
  let raf = 0;
  const call = (path, value) => {
    try { app.setParam(path, value); } catch (err) { console.error('setParam failed', path, err); }
  };
  const flush = () => {
    raf = 0;
    const items = [...pending];
    pending.clear();
    for (const [path, value] of items) call(path, value);
  };
  return {
    pending,
    set(path, value) {
      pending.set(path, value);
      if (!raf) raf = requestAnimationFrame(flush);
    },
    now(path, value) {
      pending.delete(path);
      call(path, value);
    },
    dispose() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      pending.clear();
    },
  };
}
