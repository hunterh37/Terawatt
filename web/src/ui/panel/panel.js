// Controls: breadcrumb, lens switch, year slider, scenario panel, constraint banner, level card.
// Entry point: installPanel(app) -> { dispose }. Every region re-renders on 'change', 'navigate', 'lens'
// and 'preset', coalesced to one render per animation frame.

import { DOM, LENSES } from '../../contract.js';
import { createBreadcrumb, createLensSwitch } from './nav.js';
import { createYearSlider, createScenarioPanel } from './scenario.js';
import { createBanner, createLevelCard } from './status.js';
import { createParamQueue, isTyping } from './util.js';

const EVENTS = ['change', 'navigate', 'lens', 'preset'];

export function installPanel(app) {
  const queue = createParamQueue(app);
  const ctx = { queue, dragging: new Set() };
  const parts = [];

  const region = (selector) => document.querySelector(selector);
  const add = (selector, make) => {
    const root = region(selector);
    if (!root) { console.warn(`panel: region ${selector} not found`); return; }
    parts.push({ selector, part: make(root) });
  };

  add(DOM.breadcrumb, (root) => createBreadcrumb(app, root));
  add(DOM.lensSwitch, (root) => createLensSwitch(app, root));
  add(DOM.yearSlider, (root) => createYearSlider(app, root, ctx));
  add(DOM.scenarioPanel, (root) => createScenarioPanel(app, root, ctx));
  add(DOM.constraintBanner, (root) => createBanner(app, root));
  add(DOM.levelCard, (root) => createLevelCard(app, root));

  let raf = 0;
  function renderAll() {
    raf = 0;
    for (const { selector, part } of parts) {
      try { part.render(); } catch (err) { console.error(`panel: render failed for ${selector}`, err); }
    }
  }
  function schedule() {
    if (!raf) raf = requestAnimationFrame(renderAll);
  }

  // Subscribe to app events. app.on may return an unsubscribe function; fall back to app.off if present.
  const offs = EVENTS.map((ev) => {
    const r = typeof app.on === 'function' ? app.on(ev, schedule) : null;
    if (typeof r === 'function') return r;
    return () => { if (typeof app.off === 'function') app.off(ev, schedule); };
  });

  // Keyboard: Escape or Backspace zooms out; 1 to 5 pick a lens (one key per lens, in LENSES order).
  function onKeyDown(e) {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    if (isTyping(e.target)) return;
    if (e.key === 'Escape' || e.key === 'Backspace') {
      const pop = document.getElementById('src-pop');
      if (e.key === 'Escape' && pop && !pop.hidden) return; // the source popover closes itself first
      const view = app.state && app.state.view;
      if (!view || view.level === 'offworld') return;
      e.preventDefault();
      app.zoomOut();
      return;
    }
    if (e.key.length === 1) {
      const idx = Number(e.key) - 1;
      if (Number.isInteger(idx) && idx >= 0 && idx < LENSES.length) {
        e.preventDefault();
        app.setLens(LENSES[idx]);
      }
    }
  }
  document.addEventListener('keydown', onKeyDown);

  // End of a slider drag: let the inputs re-sync to the engine's final value.
  function endDrag() {
    if (ctx.dragging.size) { ctx.dragging.clear(); schedule(); }
  }
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);
  window.addEventListener('blur', endDrag);

  renderAll();

  return {
    dispose() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointercancel', endDrag);
      window.removeEventListener('blur', endDrag);
      for (const off of offs) { try { off(); } catch (err) { console.error('panel: unsubscribe failed', err); } }
      queue.dispose();
      for (const { part } of parts) { try { part.dispose(); } catch (err) { console.error('panel: dispose failed', err); } }
      parts.length = 0;
    },
  };
}
