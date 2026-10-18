// Year slider (#year-slider) and scenario controls (#panel-scenario).
// Both are built once and updated in place, so dragging a slider never loses focus or scroll position.

import { fmt, el, sourceBadge } from '../common.js';
import { formatParam } from './util.js';

const CHIP_GROUP = 'Chip workbench';
const DEFAULT_OPEN = ['Challenge'];

function sanitize(path) { return String(path).replace(/[^A-Za-z0-9]+/g, '-'); }

/** Point an existing source badge at a new source id. */
function retarget(badge, sourceId) {
  if (!badge || !sourceId) return;
  badge.setAttribute('data-src', sourceId);
  badge.setAttribute('aria-label', `Source: ${sourceId}`);
}

// ---------------------------------------------------------------- year slider

export function createYearSlider(app, root, ctx) {
  const params = (app.engine && app.engine.PARAMS) || [];
  const yp = params.find((p) => p.path === 'year') || { min: 2025, max: 2035, step: 1 };
  const min = Number(yp.min), max = Number(yp.max), step = Number(yp.step) || 1;

  const valueEl = el('output', { class: 'yr-val', for: 'year-input' }, '');
  const input = el('input', {
    type: 'range', id: 'year-input', class: 'yr-input', min: String(min), max: String(max), step: String(step),
    'aria-label': 'Year',
    oninput: (e) => {
      const y = Number(e.target.value);
      valueEl.textContent = String(y);
      e.target.setAttribute('aria-valuetext', String(y));
      ctx.queue.set('year', y);
    },
    onpointerdown: () => ctx.dragging.add('year'),
  });

  const ticks = el('div', { class: 'yr-ticks', 'aria-hidden': 'true' });
  const span = max - min || 1;
  for (let y = min; y <= max; y += step) {
    const major = (y - min) % 5 === 0 || y === max;
    const f = (y - min) / span;
    const tick = el('span', { class: major ? 'yr-tick major' : 'yr-tick' }, major ? String(y) : null);
    tick.style.left = `calc(8px + (100% - 16px) * ${f})`;
    ticks.append(tick);
  }

  const rackName = el('span', { class: 'yr-rack-name' }, '');
  const rackBadge = sourceBadge('a.year');
  const jText = el('span', { class: 'yr-rack-j' }, '');
  const jBadge = sourceBadge('d.jtoken');
  const rack = el('div', { class: 'yr-rack', 'aria-live': 'polite' },
    el('div', { class: 'yr-rack-line' }, rackName, rackBadge),
    el('div', { class: 'yr-rack-line dim' }, jText, jBadge));

  root.classList.add('card');
  root.replaceChildren(
    el('div', { class: 'yr-label' }, el('label', { for: 'year-input' }, 'Year'), valueEl),
    el('div', { class: 'yr-track' }, input, ticks),
    rack);

  function render() {
    const s = app.state && app.state.scenario;
    const m = app.state && app.state.metrics;
    const year = s && Number.isFinite(Number(s.year)) ? Number(s.year) : (m && m.year);
    if (Number.isFinite(Number(year))) {
      if (!ctx.dragging.has('year') && !ctx.queue.pending.has('year')) {
        if (input.value !== String(year)) input.value = String(year);
        valueEl.textContent = String(year);
      }
      input.setAttribute('aria-valuetext', String(year));
    }
    const r = m && m.racksForYear && m.racksForYear.gpu;
    if (r) {
      rackName.textContent = `${r.label || 'GPU rack'}: ${fmt.kw(r.kW)}, ${fmt.num(r.chips)} chips`;
      const anchor = Number(r.year) === min || Number(r.year) === max;
      retarget(rackBadge, anchor && r.src ? r.src : 'a.year');
    }
    const j = m && m.totals && m.totals.jPerOutputToken;
    jText.textContent = `${fmt.j(j)} per output token`;
  }

  return { render, dispose() { root.classList.remove('card'); root.replaceChildren(); } };
}

// ---------------------------------------------------------------- scenario panel

function buildRange(app, p, id, ctx) {
  const out = el('output', { class: 'ctl-val', for: id }, '');
  const input = el('input', {
    type: 'range', id, min: String(p.min), max: String(p.max), step: String(p.step), 'aria-label': p.label,
    oninput: (e) => {
      const v = Number(e.target.value);
      out.textContent = formatParam(p, v);
      e.target.setAttribute('aria-valuetext', formatParam(p, v));
      ctx.queue.set(p.path, v);
    },
    onpointerdown: () => ctx.dragging.add(p.path),
  });
  const node = el('div', { class: 'ctl ctl-range' },
    el('div', { class: 'ctl-head' }, el('label', { class: 'ctl-label', for: id }, p.label), out, sourceBadge(p.sourceId)),
    input);
  return {
    node,
    update(scenario) {
      const v = app.engine.getParam(scenario, p.path);
      if (ctx.dragging.has(p.path) || ctx.queue.pending.has(p.path)) return;
      if (v != null && Number.isFinite(Number(v)) && input.value !== String(v)) input.value = String(v);
      out.textContent = formatParam(p, v);
      input.setAttribute('aria-valuetext', formatParam(p, v));
    },
  };
}

function buildSelect(app, p, id, ctx) {
  const options = (p.options || []).map(([value, label]) => el('option', { value: String(value) }, label));
  const sel = el('select', { id, 'aria-label': p.label, onchange: (e) => ctx.queue.now(p.path, e.target.value) }, options);
  const node = el('div', { class: 'ctl ctl-select' },
    el('div', { class: 'ctl-head' }, el('label', { class: 'ctl-label', for: id }, p.label), el('span', {}), sourceBadge(p.sourceId)),
    sel);
  return {
    node,
    update(scenario) {
      const v = app.engine.getParam(scenario, p.path);
      if (v != null && sel.value !== String(v)) sel.value = String(v);
    },
  };
}

function buildToggle(app, p, id, ctx) {
  const cb = el('input', {
    type: 'checkbox', role: 'switch', id, class: 'ctl-switch', 'aria-label': p.label,
    onchange: (e) => ctx.queue.now(p.path, e.target.checked),
  });
  const node = el('div', { class: 'ctl ctl-toggle' }, el('label', { class: 'ctl-label', for: id }, p.label), cb, sourceBadge(p.sourceId));
  return {
    node,
    update(scenario) {
      const v = app.engine.getParam(scenario, p.path);
      cb.checked = v == null ? p.path.endsWith('powerFlow') : Boolean(v);
    },
  };
}

function buildControl(app, p, ctx) {
  const id = `ctl-${sanitize(p.path)}`;
  if (p.kind === 'select') return buildSelect(app, p, id, ctx);
  if (p.kind === 'toggle') return buildToggle(app, p, id, ctx);
  return buildRange(app, p, id, ctx);
}

export function createScenarioPanel(app, root, ctx) {
  const params = ((app.engine && app.engine.PARAMS) || []).filter((p) => p.path !== 'year');
  const controls = [];
  const groups = new Map(); // group title -> <details>

  for (const p of params) {
    if (!groups.has(p.group)) {
      const body = el('div', { class: 'sc-body' });
      const details = el('details', { class: 'sc-group', open: DEFAULT_OPEN.includes(p.group) },
        el('summary', {}, p.group), body);
      groups.set(p.group, { details, body });
    }
    const c = buildControl(app, p, ctx);
    controls.push(c);
    groups.get(p.group).body.append(c.node);
  }

  const presetButtons = new Map(); // preset id -> button
  const presetList = el('div', { class: 'sc-presets', role: 'group', 'aria-label': 'Presets' });
  for (const pr of (app.presets || [])) {
    const b = el('button', {
      type: 'button', class: 'btn preset-chip', 'data-key': `preset:${pr.id}`, 'aria-pressed': 'false',
      onclick: () => app.applyPreset(pr.id),
    }, pr.label);
    presetButtons.set(pr.id, b);
    presetList.append(b);
  }

  const sizeBtn = el('button', {
    type: 'button', class: 'btn primary', 'data-key': 'size-to-demand',
    title: 'Set both pools to the racks that serve all of the demand',
    onclick: () => app.sizeToDemand(),
  }, 'Size to demand');

  root.classList.add('card');
  root.replaceChildren(
    el('div', { class: 'sc-head' }, el('h2', { class: 'sc-title' }, 'Scenario'), sizeBtn),
    el('div', { class: 'sc-sub' }, 'Pick a story, then change any input.'),
    presetList,
    ...[...groups.values()].map((g) => g.details));

  let lastLevel = null;

  function openGroup(title) {
    const g = groups.get(title);
    if (g) g.details.open = true;
  }

  function render() {
    const state = app.state || {};
    const scenario = state.scenario;
    if (scenario) for (const c of controls) c.update(scenario);
    for (const [id, b] of presetButtons) b.setAttribute('aria-pressed', id === state.presetId ? 'true' : 'false');
    const level = state.view && state.view.level;
    if (level !== lastLevel) {
      if (level === 'chip') openGroup(CHIP_GROUP);
      lastLevel = level;
    }
  }

  return { render, dispose() { root.classList.remove('card'); root.replaceChildren(); } };
}
