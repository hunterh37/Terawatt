// Constraint banner (#constraint-banner) and level card (#level-card).

import { CHECK_ORDER, LEVEL_TITLES, LENS_TITLES } from '../../contract.js';
import { el, readoutRow, sourceBadge } from '../common.js';
import { renderKeeping } from './util.js';
import { renderFor } from './renders.js';

/** Where each check's numbers come from (ids exist in src/data/sources.js). */
const CHECK_SOURCE = {
  grid: 's9.setting', budget: 'd.cost5yr', serving: 'd.capacity',
  cooling: 's15.pue', latency: 's13.slo', water: 'a.water_rule',
};
const MARK = { ok: '✓', warn: '!', fail: '✕' };
const WORD = { ok: 'passes', warn: 'near its limit', fail: 'fails' };

// ---------------------------------------------------------------- constraint banner

export function createBanner(app, root) {
  root.classList.add('card');
  let selectedId = null;   // a check the user picked; null means "show the first failing one"
  let lastFirstId = null;
  let lastSig = '';

  function goToCause(check) {
    const cause = (check && check.cause) || {};
    app.goTo(cause.level || 'fleet', cause.focus || {});
  }

  function pick(check) {
    selectedId = selectedId === check.id ? null : check.id;
    lastSig = '';
    render();
    if (check.severity === 'fail') goToCause(check);
  }

  function buildPill(check, shownId) {
    const sev = check.severity || (check.ok ? 'ok' : 'fail');
    return el('button', {
      type: 'button', class: `cb-pill ${sev}${check.id === shownId ? ' shown' : ''}`, 'data-key': `check:${check.id}`,
      'aria-pressed': check.id === shownId ? 'true' : 'false', 'aria-label': `${check.label}: ${WORD[sev] || sev}`,
      title: check.msg || '', onclick: () => pick(check),
    }, el('span', { class: 'cb-mark', 'aria-hidden': 'true' }, MARK[sev] || ''), el('span', { class: 'cb-name' }, check.label));
  }

  function buildDetail(check, isFirst) {
    const sev = check.severity || (check.ok ? 'ok' : 'fail');
    const cause = check.cause || {};
    const dest = LEVEL_TITLES[cause.level] || 'the cause';
    const kicker = sev === 'fail' ? (isFirst ? 'First failing check' : 'Failing check') : sev === 'warn' ? 'Near its limit' : 'Passing';
    return el('div', { class: `cb-detail ${sev}` },
      el('button', {
        type: 'button', class: 'cb-go', 'data-key': 'cb-go',
        'aria-label': `${kicker}: ${check.label}. ${check.msg || ''} Go to ${dest}.`, onclick: () => goToCause(check),
      },
      el('span', { class: 'cb-kicker' }, kicker),
      el('span', { class: 'cb-title' }, check.label),
      el('span', { class: 'cb-msg' }, check.msg || ''),
      el('span', { class: 'cb-zoom' }, `Go to ${dest}`)),
      sourceBadge(CHECK_SOURCE[check.id] || 's9.setting'));
  }

  function render() {
    const m = app.state && app.state.metrics;
    const list = (m && Array.isArray(m.checks)) ? m.checks : [];
    const byId = new Map(list.map((c) => [c.id, c]));
    const ordered = CHECK_ORDER.map((id) => byId.get(id)).filter(Boolean);
    const first = ordered.find((c) => c.severity === 'fail') || null;
    const firstId = first ? first.id : null;
    if (firstId !== lastFirstId) { selectedId = null; lastFirstId = firstId; }
    const picked = selectedId ? byId.get(selectedId) : null;
    const shown = picked || first;
    const sig = JSON.stringify([ordered.map((c) => [c.id, c.severity, c.msg]), shown && shown.id]);
    if (sig === lastSig) return;
    lastSig = sig;
    renderKeeping(root, () => {
      if (!ordered.length) return [el('div', { class: 'cb-empty' }, 'Checking the scenario...')];
      return [
        el('div', { class: 'cb-pills', role: 'group', 'aria-label': 'Constraint checks, in the order they are read' },
          ordered.map((c) => buildPill(c, shown && shown.id))),
        shown
          ? buildDetail(shown, shown === first)
          : el('div', { class: 'cb-detail ok' }, el('span', { class: 'cb-kicker' }, 'All checks pass'),
            el('span', { class: 'cb-msg' }, 'Tap a check to read its detail.')),
      ];
    });
  }

  return { render, dispose() { root.classList.remove('card'); root.replaceChildren(); } };
}

// ---------------------------------------------------------------- level card

export function createLevelCard(app, root) {
  root.classList.add('card');
  let lastSig = '';
  const warned = new Set();

  function safe(label, fn, fallback) {
    try { return fn(); } catch (err) {
      if (!warned.has(label)) { warned.add(label); console.error(`level card: ${label} failed`, err); }
      return fallback;
    }
  }

  function buildLegend(legend) {
    if (!legend) return null;
    const items = Array.isArray(legend.items) ? legend.items : [];
    return el('div', { class: 'lc-legend' },
      legend.title ? el('div', { class: 'lc-legend-title' }, legend.title) : null,
      items.length
        ? el('ul', { class: 'lc-legend-list' }, items.map((it) => el('li', {},
          el('span', { class: 'lc-swatch', 'aria-hidden': 'true', style: { background: it.color || 'transparent' } }),
          el('span', {}, it.label || ''))))
        : null,
      legend.note ? el('p', { class: 'lc-legend-note' }, legend.note) : null);
  }

  function render() {
    const state = app.state;
    if (!state || !state.view) return;
    const level = state.view.level, lens = state.view.lens, m = state.metrics;
    const lvl = typeof app.activeLevel === 'function' ? app.activeLevel() : null;
    const caption = lvl && lvl.caption ? safe('caption', () => lvl.caption(state, m), '') : '';
    const rows = lvl && lvl.readout ? safe('readout', () => lvl.readout(state, m), []) : [];
    const legend = lvl && lvl.legend ? safe('legend', () => lvl.legend(lens, state, m), null) : null;
    const safeRows = Array.isArray(rows) ? rows : [];
    for (const r of safeRows) {
      if (r && !r.sourceId && !warned.has(r.label)) { warned.add(r.label); console.warn('readout row without a source id:', r.label); }
    }
    const pic = safe('picture', () => renderFor(state), null);
    const sig = JSON.stringify([level, lens, state.view.module, caption, safeRows, legend, pic && pic.id]);
    if (sig === lastSig) return;
    lastSig = sig;
    const moduleName = state.view.module === 'engineering' ? 'Engineering' : state.view.module === 'business' ? 'Business' : '';
    renderKeeping(root, () => [
      el('div', { class: 'lc-head' },
        el('h2', { class: 'lc-title' }, LEVEL_TITLES[level] || String(level || '')),
        moduleName ? el('span', { class: 'lc-tag' }, moduleName) : null,
        el('span', { class: 'lc-lens' }, `${LENS_TITLES[lens] || ''} lens`)),
      caption ? el('p', { class: 'lc-caption' }, caption) : null,
      pic ? el('a', { class: 'lc-pic', href: pic.href, target: '_blank', rel: 'noopener', title: 'RealityHD on GitHub' },
        el('img', { src: pic.src, alt: pic.alt, width: 640, height: 480, decoding: 'async' }),
        el('span', {}, el('b', {}, pic.label), ', as modelled for the Terawatt visionOS app. Render: RealityHD, MIT licence.')) : null,
      safeRows.length ? el('div', { class: 'lc-rows' }, safeRows.filter(Boolean).map((r) => readoutRow(r))) : null,
      buildLegend(legend),
      el('p', { class: 'schematic-note' }, 'Geometry is schematic, not to scale.'),
    ]);
  }

  return { render, dispose() { root.classList.remove('card'); root.replaceChildren(); } };
}
