// Module 1 business panel (#panel-business).
// installBusiness(app) renders seven cards: break-even, returns, money flow, site constraints,
// facility size, 2025 to 2035 projection and existing data centers. It re-renders on app 'change'
// and 'navigate', at most once per animation frame. Open on business levels (fleet, site, offworld);
// a one-line summary on engineering levels, with a button to open it anyway.
//
// Every number comes from app.metrics, app.catalog, app.sources or app.data. Nothing is typed in here.

import { MODULES } from '../../contract.js';
import { el, fmt, sourceBadge } from '../common.js';
import { createSections } from './sections.js';

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const raf = (fn) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fn) : setTimeout(fn, 16));
const caf = (id) => (typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame(id) : clearTimeout(id));

/** Cache key for the 2025 to 2035 projection: everything that changes racks or energy per token. */
function projectionKey(sc) {
  const pools = sc.pools || {};
  const rest = { ...sc };
  delete rest.year; delete rest.finance; delete rest.chipLab; delete rest.view; delete rest.pools;
  return JSON.stringify([rest, pools.prefill && pools.prefill.type, pools.decode && pools.decode.type]);
}

export function installBusiness(app) {
  const host = typeof document !== 'undefined' ? document.getElementById('panel-business') : null;
  if (!host || !app) return { dispose() {} };

  let disposed = false, frame = 0, forced = null, lastModule = null;
  let projKey = null, projVal = null;
  const unsubs = [];
  const handlers = [];

  // ---- shell, built once ----
  const sections = createSections(app);
  const summary = el('div', { class: 'bz-summary' });
  const toggle = el('button', { class: 'btn bz-open', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'bz-body' }, 'Show');
  const head = el('div', { class: 'card bz-head' },
    el('div', { class: 'bz-head-text' }, el('strong', {}, 'Business case'), summary),
    toggle);
  const body = el('div', { class: 'bz-body', id: 'bz-body' }, sections.map((s) => s.root));
  body.hidden = true;
  host.classList.add('bz-host');
  host.replaceChildren(head, body);

  toggle.addEventListener('click', () => {
    forced = body.hidden; // hidden means closed now, so this click opens it
    schedule();
  });

  function getProjection() {
    const sc = app.state && app.state.scenario;
    if (!sc || !app.engine || typeof app.engine.projectYears !== 'function') return null;
    const key = projectionKey(sc);
    if (key !== projKey) {
      projKey = key;
      try { projVal = app.engine.projectYears(sc); } catch (err) { console.error('projectYears failed', err); projVal = null; }
    }
    return projVal;
  }

  function renderSummary(m) {
    const f = m.finance || {};
    const be = f.breakevenUSDPerUserMonth;
    summary.replaceChildren(
      isNum(be) ? `Break-even ${fmt.usd(be)} per user per month` : 'Break-even n/a',
      sourceBadge('a.breakeven'),
      `, NPV ${fmt.usd(f.npvUSD)}`,
      sourceBadge('d.finance'));
  }

  function render() {
    frame = 0;
    if (disposed) return;
    const state = app.state || {};
    const m = app.metrics || state.metrics;
    if (!m || !m.finance || !m.totals) return;
    const view = state.view || {};
    const level = view.level || 'fleet';
    const moduleId = view.module || (MODULES.business.includes(level) ? 'business' : 'engineering');
    if (moduleId !== lastModule) { forced = null; lastModule = moduleId; }
    const open = forced == null ? moduleId === 'business' : forced;

    renderSummary(m);
    body.hidden = !open;
    host.classList.toggle('is-open', open);
    toggle.textContent = open ? 'Hide' : 'Show';
    toggle.setAttribute('aria-expanded', String(open));
    if (!open) return;

    const focus = view.focus || {};
    const ctx = {
      app, state, m, view, level,
      scenario: state.scenario || {},
      catalog: app.catalog || (app.data && app.data.catalog) || {},
      focusSite: focus.site || null,
      projection: getProjection,
    };
    for (const s of sections) {
      try {
        s.update(ctx);
      } catch (err) {
        console.error(`business panel section "${s.id}" failed`, err);
        const bodyEl = s.root.querySelector('.bz-card-body');
        if (bodyEl) bodyEl.replaceChildren(el('p', { class: 'bz-note bz-warn' }, 'This card could not be drawn.'));
      }
    }
  }

  function schedule() {
    if (disposed || frame) return;
    frame = raf(render);
  }

  for (const ev of ['change', 'navigate']) {
    const fn = () => schedule();
    handlers.push([ev, fn]);
    const off = typeof app.on === 'function' ? app.on(ev, fn) : null;
    if (typeof off === 'function') unsubs.push(off);
  }

  render();

  return {
    dispose() {
      disposed = true;
      if (frame) caf(frame);
      frame = 0;
      for (const off of unsubs) { try { off(); } catch (err) { /* ignore */ } }
      if (typeof app.off === 'function') for (const [ev, fn] of handlers) { try { app.off(ev, fn); } catch (err) { /* ignore */ } }
      for (const s of sections) { if (typeof s.dispose === 'function') s.dispose(); }
      host.classList.remove('bz-host', 'is-open');
      host.replaceChildren();
    },
  };
}
