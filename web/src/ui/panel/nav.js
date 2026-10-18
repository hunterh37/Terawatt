// Breadcrumb (#breadcrumb) and lens switch (#lens-switch).

import { LEVELS, LEVEL_TITLES, LENSES, LENS_TITLES, OFFWORLD_KINDS } from '../../contract.js';
import { el } from '../common.js';
import { renderKeeping } from './util.js';

const POOL_TITLES = { prefill: 'Prefill', decode: 'Decode' };

/** Levels from the root (offworld or fleet) down to the current level. Off-world sites skip building and hall. */
export function levelPath(view) {
  const level = view && view.level;
  const focus = (view && view.focus) || {};
  if (!LEVELS.includes(level)) return ['fleet'];
  if (level === 'offworld' || level === 'fleet') return [level];
  const off = OFFWORLD_KINDS.includes(focus.site);
  const chain = off ? ['site', 'rack', 'chip'] : ['site', 'building', 'hall', 'rack', 'chip'];
  const i = chain.indexOf(level);
  return [off ? 'offworld' : 'fleet', ...(i < 0 ? [] : chain.slice(0, i + 1))];
}

/** Text for one crumb. The site crumb is the site's name, so the path reads "Earth fleet / West Texas". */
export function crumbLabel(app, level, focus) {
  const f = focus || {};
  if (level === 'site') {
    const sites = app.catalog && app.catalog.sites;
    const s = sites && sites[f.site];
    return (s && s.name) || LEVEL_TITLES.site;
  }
  if (level === 'hall') {
    const i = Number(f.hall);
    return Number.isFinite(i) ? `${LEVEL_TITLES.hall} ${i + 1}` : LEVEL_TITLES.hall;
  }
  if (level === 'rack') {
    const pool = POOL_TITLES[f.rack];
    return pool ? `${pool} rack` : LEVEL_TITLES.rack;
  }
  return LEVEL_TITLES[level] || String(level);
}

export function createBreadcrumb(app, root) {
  root.setAttribute('aria-label', 'Zoom level');
  let lastSig = '';

  function render() {
    const view = (app.state && app.state.view) || {};
    const path = levelPath(view);
    const labels = path.map((lv) => crumbLabel(app, lv, view.focus));
    const sig = JSON.stringify([view.level, labels]);
    if (sig === lastSig) return;
    lastSig = sig;
    const atTop = view.level === LEVELS[LEVELS.length - 1];
    renderKeeping(root, () => [
      el('div', { class: 'bc' },
        el('button', {
          type: 'button', class: 'bc-up', 'data-key': 'bc-up', 'aria-label': 'Zoom out one level', title: 'Zoom out (Esc)',
          disabled: atTop, onclick: () => app.zoomOut(),
        }),
        el('ol', { class: 'bc-list' }, path.map((lv, i) => {
          const last = i === path.length - 1;
          return el('li', {},
            last
              ? el('span', { class: 'bc-current', 'aria-current': 'page' }, labels[i])
              : el('button', {
                type: 'button', class: 'bc-crumb', 'data-key': `bc-${lv}`, title: `Go to ${LEVEL_TITLES[lv] || lv}`,
                onclick: () => app.goTo(lv),
              }, labels[i]),
            last ? null : el('span', { class: 'bc-sep', 'aria-hidden': 'true' }, ' / '));
        }))),
    ]);
    // When the path is wider than the bar, keep the current level in view.
    const list = root.querySelector('.bc-list');
    if (list) { list.scrollLeft = list.scrollWidth; list.classList.toggle('clipped', list.scrollLeft > 0); }
  }

  return { render, dispose() { root.replaceChildren(); lastSig = ''; } };
}

export function createLensSwitch(app, root) {
  root.setAttribute('role', 'radiogroup');
  root.setAttribute('aria-label', 'Lens');
  const buttons = LENSES.map((id, i) => el('button', {
    type: 'button', role: 'radio', class: `lens-btn lens-${id}`, 'data-lens': id, 'aria-checked': 'false',
    'aria-label': `${LENS_TITLES[id]} lens`, tabindex: i === 0 ? '0' : '-1', title: `${LENS_TITLES[id]} lens (key ${i + 1})`,
    onclick: () => app.setLens(id),
  }, el('span', { class: 'lens-dot', 'aria-hidden': 'true' }), el('span', { class: 'lens-name' }, LENS_TITLES[id]),
  el('kbd', { 'aria-hidden': 'true' }, String(i + 1))));
  root.replaceChildren(...buttons);

  function currentIndex() {
    const lens = app.state && app.state.view && app.state.view.lens;
    const i = LENSES.indexOf(lens);
    return i < 0 ? 0 : i;
  }

  function onKeyDown(e) {
    const n = LENSES.length;
    let next = -1;
    const cur = currentIndex();
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (cur + 1) % n;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (cur + n - 1) % n;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = n - 1;
    if (next < 0) return;
    e.preventDefault();
    app.setLens(LENSES[next]);
    buttons[next].focus();
  }
  root.addEventListener('keydown', onKeyDown);

  function render() {
    const cur = currentIndex();
    buttons.forEach((b, i) => {
      b.setAttribute('aria-checked', i === cur ? 'true' : 'false');
      b.setAttribute('tabindex', i === cur ? '0' : '-1');
    });
  }

  return {
    render,
    dispose() { root.removeEventListener('keydown', onKeyDown); root.replaceChildren(); },
  };
}
