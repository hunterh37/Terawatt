// App shell: state, engine runs, navigation, picking, and wiring for the panels, levels and XR.
// The App API it exposes on window.app is specified in src/contract.js.

import * as THREE from 'three';
import { LEVELS, LEVEL_TITLES, MODULES, OFFWORLD_KINDS, LENSES, ALL_SITE_IDS } from './contract.js';
import * as kit from './scene/kit.js';
import { createStage } from './scene/stage.js';
import * as engine from './engine/engine.js';
import { CATALOG } from './data/catalog.js';
import { SOURCES } from './data/sources.js';
import { LAND_DOTS } from './data/land-dots.js';
import { EXISTING_DCS } from './data/existing-dcs.js';
import { SENTIMENT } from './data/sentiment.js';
import { installSourcePopover, el } from './ui/common.js';
import { createTour } from './tour.js';

const LEVEL_LOADERS = {
  chip: () => import('./levels/chip.js'),
  rack: () => import('./levels/rack.js'),
  hall: () => import('./levels/hall.js'),
  building: () => import('./levels/building.js'),
  site: () => import('./levels/site.js'),
  fleet: () => import('./levels/fleet.js'),
  offworld: () => import('./levels/offworld.js'),
};

// ---------- tiny event emitter ----------
const listeners = new Map();
const on = (ev, fn) => { if (!listeners.has(ev)) listeners.set(ev, new Set()); listeners.get(ev).add(fn); return () => listeners.get(ev).delete(fn); };
const emit = (ev, ...args) => { for (const fn of listeners.get(ev) || []) { try { fn(...args); } catch (e) { console.error(`[app] ${ev} listener failed`, e); } } };

// ---------- state ----------
const DEFAULT_FOCUS = { site: 'wtx', building: '0', hall: '0', rack: 'decode', chip: 'gpu' };
const state = {
  scenario: engine.PRESETS['fit-grid'].make(),
  view: { level: 'fleet', focus: { ...DEFAULT_FOCUS }, lens: 'power', module: 'business' },
  metrics: null,
  presetId: 'fit-grid',
};

const data = {
  catalog: CATALOG, sources: SOURCES, landDots: LAND_DOTS, existingDCs: EXISTING_DCS, sentiment: SENTIMENT,
  cleanview: { totals: CATALOG.cleanview, markers: null },
};

let stage = null, active = null, activeId = null, mountSeq = 0;

function moduleOf(level) { return MODULES.business.includes(level) ? 'business' : 'engineering'; }
const isOffworld = (siteId) => OFFWORLD_KINDS.includes(siteId);

function run() {
  // Keep the engine's chip workbench and focused site in step with the view.
  const f = state.view.focus;
  state.scenario.view = { site: ALL_SITE_IDS.includes(f.site) ? f.site : 'wtx', pool: f.rack === 'prefill' ? 'prefill' : 'decode' };
  state.metrics = engine.derive(state.scenario, { sentiment: SENTIMENT });
  app.metrics = state.metrics;
  if (active) { try { active.update(state, state.metrics, state.view.lens); } catch (e) { console.error(`[level ${activeId}] update failed`, e); } }
  emit('change', state, state.metrics);
}

// ---------- levels ----------
function placeholderLevel(level, err) {
  const group = new THREE.Group();
  const msg = kit.label(`${LEVEL_TITLES[level]} view did not load`, { size: 0.03, color: kit.PALETTE.warn });
  msg.position.set(0, 0.2, 0); group.add(msg);
  return {
    group, update() {}, pickables: () => [], tick() {},
    legend: () => ({ title: LEVEL_TITLES[level], items: [], note: 'This scale failed to load; the rest of the app still works.' }),
    readout: () => [], caption: () => `${LEVEL_TITLES[level]} view is unavailable: ${String(err && err.message || err).slice(0, 120)}`,
    dispose() { kit.dispose(group); },
  };
}

async function mountLevel(level) {
  const seq = ++mountSeq;
  let inst;
  try {
    const mod = await LEVEL_LOADERS[level]();
    if (seq !== mountSeq) return;
    inst = mod.create({ THREE, kit, data, app });
    inst.update(state, state.metrics, state.view.lens);
  } catch (e) {
    console.error(`[level ${level}] failed`, e);
    if (seq !== mountSeq) return;
    inst = placeholderLevel(level, e);
  }
  const old = active;
  active = inst; activeId = level;
  stage.mount(inst.group);
  if (old) setTimeout(() => { try { old.dispose(); } catch (e) { console.error('[level] dispose failed', e); } }, 400);
  emit('navigate', state.view);
}

function normaliseFocus(level, focus) {
  const f = { ...state.view.focus, ...focus };
  if (!ALL_SITE_IDS.includes(f.site)) f.site = DEFAULT_FOCUS.site;
  if (f.rack !== 'prefill' && f.rack !== 'decode') f.rack = DEFAULT_FOCUS.rack;
  const m = state.metrics, halls = (m && m.sites[f.site] && m.sites[f.site].halls) || 1;
  if (!(Number(f.hall) >= 0 && Number(f.hall) < halls)) f.hall = '0';
  f.building = '0';
  const poolType = state.scenario.pools[f.rack] && state.scenario.pools[f.rack].type;
  if (level === 'chip' && !focus.chip) f.chip = poolType || 'gpu';
  if (level === 'rack' || level === 'chip') f.chip = focus.chip || poolType || f.chip;
  return f;
}

function goTo(level, focus = {}) {
  if (!LEVELS.includes(level)) return;
  let target = level;
  const f = normaliseFocus(level, focus);
  // Off-world sites skip building and hall.
  if (isOffworld(f.site) && (target === 'building' || target === 'hall')) target = 'rack';
  state.view = { ...state.view, level: target, focus: f, module: moduleOf(target) };
  run();
  return mountLevel(target);
}

function zoomIn(pick) {
  if (!pick || !pick.level) return;
  if (pick.level === activeId && pick.level === 'chip') { toast(pick.label || 'Finest scale'); return; }
  const focus = pick.level === 'fleet' || pick.level === 'offworld' ? {} : { [pick.level]: String(pick.id ?? '') };
  if (pick.level === 'site' && pick.id) focus.site = pick.id;
  return goTo(pick.level, focus);
}

function parentOf(level) {
  const off = isOffworld(state.view.focus.site);
  switch (level) {
    case 'chip': return 'rack';
    case 'rack': return off ? 'site' : 'hall';
    case 'hall': return 'building';
    case 'building': return 'site';
    case 'site': return off ? 'offworld' : 'fleet';
    case 'fleet': return 'offworld';
    default: return null;
  }
}
function zoomOut() {
  const p = parentOf(state.view.level);
  if (!p) { toast('This is the widest view'); return; }
  return goTo(p);
}

function setLens(lens) {
  if (!LENSES.includes(lens) || lens === state.view.lens) return;
  state.view = { ...state.view, lens };
  if (active) { try { active.update(state, state.metrics, lens); } catch (e) { console.error('[level] lens update failed', e); } }
  emit('lens', lens);
}

function setParam(path, value) {
  state.scenario = engine.applyParam(state.scenario, path, value);
  state.presetId = null;
  run();
}
function applyPreset(id) {
  const p = engine.PRESETS[id]; if (!p) return;
  state.scenario = p.make(); state.presetId = id;
  run(); emit('preset', id);
}
function sizeToDemand() { state.scenario = engine.sizePools(state.scenario); state.presetId = null; run(); toast('Pools sized to serve 100% of peak demand'); }

let toastTimer = 0;
function toast(text, ms = 3200) {
  const t = document.getElementById('toast'); if (!t) return;
  t.textContent = text; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

const app = {
  state, metrics: null, data, catalog: CATALOG, sources: SOURCES,
  engine: { derive: engine.derive, projectYears: (s, years) => engine.projectYears(s, years, { sentiment: SENTIMENT }), PARAMS: engine.PARAMS, PRESETS: engine.PRESETS, getParam: engine.getParam },
  presets: Object.entries(engine.PRESETS).map(([id, p]) => ({ id, label: p.label })),
  goTo, zoomIn, zoomOut, setLens, setParam, applyPreset, sizeToDemand, on, toast,
  activeLevel: () => active,
  get stage() { return stage; },
};
// app.state must stay the same object the panels hold, so state is mutated in place above.
window.app = app;

// ---------- desktop picking: click picks, drag orbits ----------
function installPointer() {
  const canvas = stage.renderer.domElement;
  const tip = el('div', { id: 'hover-tip', hidden: true }); document.body.append(tip);
  let down = null, lastMove = 0;
  canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  canvas.addEventListener('pointerup', (e) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), dt = performance.now() - down.t; down = null;
    if (moved > 6 || dt > 600) return;
    const pick = stage.pickAtClient(e.clientX, e.clientY);
    if (pick) zoomIn(pick);
  });
  canvas.addEventListener('pointermove', (e) => {
    const now = performance.now(); if (now - lastMove < 60 || down) return; lastMove = now;
    const pick = stage.pickAtClient(e.clientX, e.clientY);
    canvas.style.cursor = pick ? 'pointer' : 'grab';
    if (pick && pick.label) { tip.textContent = pick.label; tip.hidden = false; tip.style.left = `${e.clientX + 14}px`; tip.style.top = `${e.clientY + 12}px`; }
    else tip.hidden = true;
  });
  canvas.addEventListener('pointerleave', () => { tip.hidden = true; });
  canvas.addEventListener('dblclick', () => stage.frameTable());
  // Fallback keys. The panel handles them first (on document) and marks the event handled, so skip those.
  window.addEventListener('keydown', (e) => {
    if (e.defaultPrevented) return;
    if (e.target && /input|select|textarea/i.test(e.target.tagName)) return;
    if (e.key === 'Escape' || e.key === 'Backspace') { e.preventDefault(); zoomOut(); }
    const n = Number(e.key); if (n >= 1 && n <= LENSES.length) setLens(LENSES[n - 1]);
  });
}

async function installOptional(label, loader, fn) {
  try { const mod = await loader(); return fn(mod); }
  catch (e) { console.error(`[${label}] failed to install`, e); return null; }
}

function readUrl() {
  const q = new URLSearchParams(location.search);
  const preset = q.get('preset'), level = q.get('level'), site = q.get('site'), lens = q.get('lens'), year = Number(q.get('year'));
  if (preset && engine.PRESETS[preset]) { state.scenario = engine.PRESETS[preset].make(); state.presetId = preset; }
  if (year >= 2025 && year <= 2035) { state.scenario = engine.applyParam(state.scenario, 'year', year); state.presetId = null; }
  if (lens && LENSES.includes(lens)) state.view.lens = lens;
  return { level: LEVELS.includes(level) ? level : 'fleet', focus: site && ALL_SITE_IDS.includes(site) ? { site } : {} };
}

async function boot() {
  stage = createStage(document.getElementById('stage'));
  installSourcePopover(SOURCES);
  installPointer();
  stage.onFrame((dt, t) => { if (active && active.tick) active.tick(dt, t); });

  // Cleanview markers exist only in a local checkout (licence). They load only on a local server and only with
  // ?cleanview=1, so screenshots and the public build show the credited counts and never the markers.
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).get('cleanview') === '1') {
    try { const cv = await import('../notes/private/cleanview-markers.js'); data.cleanview.markers = cv.CLEANVIEW_MARKERS || null; } catch { data.cleanview.markers = null; }
  }

  const start = readUrl();
  run();
  await installOptional('panel', () => import('./ui/panel/panel.js'), (m) => m.installPanel(app));
  await installOptional('business', () => import('./ui/business/business.js'), (m) => m.installBusiness(app));
  await goTo(start.level, start.focus);
  installOptional('xr', () => import('./xr/xr.js'), (m) => m.installXR({ THREE, stage, app, kit, slot: document.getElementById('xr-slot') }));

  const tour = createTour(app);
  const btn = document.getElementById('tour-btn');
  if (btn) btn.addEventListener('click', () => { if (tour.running) { tour.stop(); btn.textContent = 'Tour'; } else { btn.textContent = 'Stop tour'; tour.start().then(() => { btn.textContent = 'Tour'; }); } });
  app.tour = tour;

  const bootEl = document.getElementById('boot'); if (bootEl) { bootEl.classList.add('done'); setTimeout(() => bootEl.remove(), 600); }
  window.__ready = true;
}

boot().catch((e) => {
  console.error('[boot] failed', e);
  const b = document.getElementById('boot'); if (b) b.textContent = `Could not start: ${e.message}. WebGL may be off in this browser.`;
});
