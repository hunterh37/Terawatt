// One site (Module 1, Business).
// Earth sites: a terrain plate, a GHOST building sized by facility MW with a solid floor slab per hall,
// a substation with its grid line, a cooling plant that matches the site's cooling type, and nearby known
// AI campuses as labelled ghost blocks. Off-world sites: no building. LEO is a cluster of satellites with
// radiator and solar wings; Moon and Mars are a surface patch with radiator fields.
// Schematic: sizes follow the numbers but are not to scale.

import { ALL_SITE_IDS, OFFWORLD_KINDS, SITE_IDS } from '../contract.js';

export const id = 'site';

const noop = () => {};
const RING_R = 0.26;

const num = (x, d = 0) => (Number.isFinite(x) ? x : d);
const clamp01 = (x) => Math.min(1, Math.max(0, Number.isFinite(x) ? x : 0));
const shortName = (s) => String(s || '').split(' (')[0];

/** Points, lines and sprites must never catch pick rays (Points and Line use a huge default threshold). */
function inert(root) {
  root.traverse((o) => { if (o.isPoints || o.isLine || o.isSprite) o.raycast = noop; });
}

function earthList(metrics) {
  const out = [];
  if (!metrics || !metrics.sites) return out;
  for (const sid of SITE_IDS) if (metrics.sites[sid]) out.push(metrics.sites[sid]);
  return out;
}

/** Lens meaning for an Earth site, compared across all six Earth sites. */
function earthSpec(lens, metrics, catalog, kit) {
  const fmt = kit.fmt;
  const list = earthList(metrics);
  const col = (fn) => list.map(fn).filter((v) => Number.isFinite(v));
  const minOf = (a, d) => (a.length ? Math.min(...a) : d);
  const maxOf = (a, d) => (a.length ? Math.max(...a) : d);
  if (lens === 'power') {
    return { title: 'Power: facility MW', get: (m) => m.facilityMW, lo: 0, hi: maxOf(col((m) => m.facilityMW), 0),
      fmtV: (v) => fmt.mw(v), note: 'Colour is facility power, IT power times PUE. Source d.facility.' };
  }
  if (lens === 'cost') {
    const prices = col((m) => m.priceUSDPerMWh);
    return { title: 'Cost: energy price', get: (m) => m.priceUSDPerMWh, lo: minOf(prices, 0), hi: maxOf(prices, 0),
      fmtV: (v) => `${fmt.usd(v)}/MWh`, note: 'Colour is the industrial energy price per MWh. Sources ext.eia_price, ext.ssb_price, tw.sites.' };
  }
  if (lens === 'sentiment') {
    return { title: 'Sentiment: local news stance', get: (m) => (m.sentiment && Number.isFinite(m.sentiment.score) ? m.sentiment.score : 0), lo: -2, hi: 2,
      fmtV: () => '', note: 'Colour is the stance of one recent local news article. A sample, not a poll. Source ext.sentiment.' };
  }
  if (lens === 'water') {
    return { title: 'Water: megalitres (ML) per year', get: (m) => m.waterMLPerYear, lo: 0, hi: maxOf(col((m) => m.waterMLPerYear), 0),
      fmtV: (v) => fmt.ml(v), note: 'Colour is cooling water use per year. Only evaporative cooling drinks water. Source d.water.' };
  }
  const cools = ['airChillers', 'airEvap', 'dlc', 'immersion']
    .map((k) => (catalog && catalog.cooling ? catalog.cooling[k] : null)).filter(Boolean);
  const pues = col((m) => m.pue);
  return { title: 'Heat: site PUE (facility power / IT power)', get: (m) => m.pue,
    lo: cools.length ? Math.min(...cools.map((c) => c.pueCold)) : minOf(pues, 1),
    hi: cools.length ? Math.max(...cools.map((c) => c.pueDesert)) : maxOf(pues, 1),
    fmtV: (v) => `PUE ${num(v).toFixed(2)}`, note: 'A lower PUE means less power lost to cooling. Source s15.pue.' };
}

/** Lens meaning for an off-world site, compared across LEO, Moon and Mars. */
function offSpec(lens, metrics, kit) {
  const fmt = kit.fmt;
  const list = metrics && metrics.sites ? OFFWORLD_KINDS.map((k) => metrics.sites[k]).filter(Boolean) : [];
  const maxOf = (fn) => list.reduce((a, m) => Math.max(a, num(fn(m))), 0);
  if (lens === 'power') {
    return { title: 'Power: IT MW placed off-world', get: (m) => m.itMW, lo: 0, hi: maxOf((m) => m.itMW),
      fmtV: (v) => fmt.mw(v), note: 'Colour is IT power placed at this site. Source d.facility.' };
  }
  if (lens === 'cost') {
    return { title: 'Cost: launch cost', get: (m) => m.launchUSD, lo: 0, hi: maxOf((m) => m.launchUSD),
      fmtV: (v) => fmt.usd(v), note: 'Colour is launch cost: mass times dollars per kg times the site multiplier. Source d.launch.' };
  }
  if (lens === 'sentiment') {
    return { title: 'Sentiment: news stance', get: (m) => (m.sentiment && Number.isFinite(m.sentiment.score) ? m.sentiment.score : 0), lo: -2, hi: 2,
      fmtV: () => '', note: 'Colour is the stance of one recent news article, if any was found. A sample, not a poll. Source ext.sentiment.' };
  }
  if (lens === 'water') {
    return { title: 'Water: n/a off-world', get: () => 0, lo: 0, hi: 0, fmtV: () => '', items: [],
      note: 'n/a at this scale: off-world sites use no cooling water. Source d.water.' };
  }
  return { title: 'Heat: radiator area', get: (m) => m.radiatorM2, lo: 0, hi: maxOf((m) => m.radiatorM2),
    fmtV: (v) => `${fmt.short(v)} m2`, note: 'Colour is the radiator area needed to shed the heat, since space has only radiators. Source d.radiator.' };
}

function specFor(lens, kind, metrics, catalog, kit) {
  return kind === 'earth' ? earthSpec(lens, metrics, catalog, kit) : offSpec(lens, metrics, kit);
}

function specItems(lens, spec, kit) {
  if (spec.items) return spec.items;
  if (lens === 'sentiment') {
    return [{ color: kit.rampHex('sentiment', 0), label: 'Mostly opposed' }, { color: kit.rampHex('sentiment', 0.5), label: 'Mixed' },
      { color: kit.rampHex('sentiment', 1), label: 'Mostly supportive' }];
  }
  if (!(spec.hi > spec.lo)) return [{ color: kit.rampHex(lens, 0), label: spec.fmtV(spec.lo) }];
  return kit.legendSteps(lens, spec.lo, spec.hi, spec.fmtV, 5);
}

export function create(ctx) {
  const THREE = ctx.THREE;
  const kit = ctx.kit;
  const app = ctx.app || null;
  const data = ctx.data || {};
  const catalog = data.catalog || {};
  const registry = data.sources || {};
  const fmt = kit.fmt;
  const PAL = kit.PALETTE;
  const existing = Array.isArray(data.existingDCs) ? data.existingDCs : [];
  const landDots = Array.isArray(data.landDots) ? data.landDots : [];
  const maxCampusMW = Math.max(1, ...existing.map((d) => num(d.mw)));
  const srcOr = (sid, fallback) => (sid && registry[sid] ? sid : fallback);
  const meshRaycast = THREE.Mesh.prototype.raycast;
  const instRaycast = THREE.InstancedMesh.prototype.raycast;

  const WHITE = new THREE.Color('#ffffff');
  const COLD = new THREE.Color('#1d2b36');
  const DESERT = new THREE.Color('#40372b');
  const GREY = new THREE.Color('#4a5468');
  const WATERC = new THREE.Color(PAL.water);
  const BODY = new THREE.Color('#8493ad');
  const DARK = new THREE.Color('#1a2230');

  const group = new THREE.Group();
  group.name = 'site';
  const cur = {
    metrics: app && app.metrics ? app.metrics : null,
    lens: (app && app.state && app.state.view && app.state.view.lens) || 'heat',
    focus: 'wtx',
    key: '',
  };
  let parts = null;
  let content = null;

  const makeLabel = (text, opts) => {
    const l = kit.label(text, opts);
    l.userData.lastText = text;
    l.raycast = noop;
    return l;
  };
  const putText = (l, text) => {
    if (l && l.userData.lastText !== text) { l.userData.setText(text); l.userData.lastText = text; }
  };

  function focusIdOf(state) {
    const f = state && state.view && state.view.focus ? state.view.focus.site : null;
    if (f && ALL_SITE_IDS.indexOf(f) >= 0) return f;
    const a = app && app.state && app.state.view && app.state.view.focus ? app.state.view.focus.site : null;
    if (a && ALL_SITE_IDS.indexOf(a) >= 0) return a;
    return cur.focus;
  }

  const satCount = (m) => (m.enabled !== false ? 3 + Math.round(9 * kit.norm(num(m.radiatorM2), 1e4, 1e6, { log: true })) : 4);
  const panelCount = (m) => (m.enabled !== false ? 8 + Math.round(40 * kit.norm(num(m.radiatorM2), 1e3, 1e6, { log: true })) : 8);

  function keyFor(sid, m) {
    const on = m.enabled !== false ? 1 : 0;
    if (m.kind === 'earth') {
      const near = existing.filter((d) => d.nearSite === sid).length;
      return `e|${sid}|${on}|${Math.max(0, Math.floor(num(m.halls)))}|${m.cooling}|${near}`;
    }
    if (m.kind === 'leo') return `l|${on}|${satCount(m)}`;
    return `s|${sid}|${on}|${panelCount(m)}`;
  }

  // ---------- shared small builders ----------

  function schematicNote(root) {
    const l = makeLabel('Schematic, not to scale', { size: 0.0105, color: PAL.dim, bg: null });
    l.position.set(0.3, 0.012, 0.46);
    root.add(l);
  }

  function lineMat(color, opacity) {
    return new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  }

  function circlePoints(r, n) {
    const pts = [];
    for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2; pts.push([r * Math.cos(a), r * Math.sin(a), 0]); }
    return pts;
  }

  function earthBall(radius) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.SphereGeometry(radius, 36, 24), kit.material('#10243f', { rough: 0.9, metal: 0 })));
    const pos = [];
    const tmp = new THREE.Vector3();
    landDots.forEach((d, i) => {
      if (i % 3 !== 0 || !d || !Number.isFinite(d[0]) || !Number.isFinite(d[1])) return;
      kit.latLonToVec3(d[0], d[1], radius * 1.01, tmp);
      pos.push([tmp.x, tmp.y, tmp.z]);
    });
    if (pos.length) g.add(kit.dots(pos, { size: 1.8, color: PAL.land }));
    return g;
  }

  // ---------- Earth site ----------

  function buildDry() {
    const g = new THREE.Group();
    const bodies = kit.instancedBoxes(6, kit.sharedMaterial('#ffffff'));
    const fans = kit.instancedBoxes(6, kit.sharedMaterial('#ffffff'));
    for (let i = 0; i < 6; i++) {
      const c = i % 2;
      const r = Math.floor(i / 2);
      const x = (c - 0.5) * 0.08;
      const z = (r - 1) * 0.062;
      kit.setInstance(bodies, i, { x, y: 0, z, sx: 0.07, sy: 0.026, sz: 0.052, color: BODY });
      kit.setInstance(fans, i, { x, y: 0.026, z, sx: 0.046, sy: 0.004, sz: 0.036, color: DARK });
    }
    kit.instancesDone(bodies);
    kit.instancesDone(fans);
    g.add(bodies, fans);
    return g;
  }

  function buildEvap(p) {
    const g = new THREE.Group();
    const towerMat = kit.sharedMaterial('#7f8da6', { rough: 0.7 });
    const capMat = kit.sharedMaterial('#1a2230');
    const plumeMat = kit.sharedMaterial('#e8edf5', { opacity: 0.25 });
    for (let i = 0; i < 3; i++) {
      const z = (i - 1) * 0.065;
      const tower = kit.cylinder(0.02, 0.028, 0.085, towerMat, 20);
      tower.position.set(-0.035, 0, z);
      const cap = kit.cylinder(0.018, 0.018, 0.004, capMat, 16);
      cap.position.set(-0.035, 0.085, z);
      const plume = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), plumeMat);
      plume.position.set(-0.035, 0.12, z);
      g.add(tower, cap, plume);
    }
    p.tankMat = kit.material(PAL.water, { opacity: 0.7, rough: 0.2, metal: 0 });
    const tank = kit.cylinder(0.04, 0.04, 0.05, p.tankMat, 24);
    tank.position.set(0.07, 0, 0);
    g.add(tank);
    return g;
  }

  function buildEarth(sid, m) {
    const root = new THREE.Group();
    const p = { kind: 'earth', root, flows: [], pickables: [], slabKey: '', tankMat: null };
    const pick = { level: 'building', id: '0', label: `${m.name || sid} building` };

    p.terrainMat = kit.material('#1b2430', { rough: 0.95, metal: 0 });
    root.add(kit.plate(0.96, 0.96, p.terrainMat, 0.006));

    // Ghost building: footprint and height are set in placeEarth from facility MW.
    p.ghostMat = kit.ghostMaterial(PAL.ghost, 0.26);
    p.bldg = kit.box(1, 1, 1, p.ghostMat);
    p.edgeMat = lineMat(PAL.ghost, 0.85);
    p.bldg.add(new THREE.LineSegments(new THREE.EdgesGeometry(p.bldg.geometry), p.edgeMat));
    p.bldg.userData.pick = pick;

    // One solid floor slab per hall, in one InstancedMesh.
    p.nHalls = Math.max(0, Math.floor(num(m.halls)));
    p.slabMat = kit.material('#ffffff', { rough: 0.6 });
    p.slabs = kit.instancedBoxes(Math.max(1, p.nHalls), p.slabMat);
    p.slabs.count = p.nHalls;
    p.slabs.userData.pick = pick;
    root.add(p.bldg, p.slabs);
    p.pickables.push(p.bldg, p.slabs);

    // Substation and its grid line.
    p.sub = new THREE.Group();
    const padMat = kit.sharedMaterial('#2a3446');
    const metalMat = kit.sharedMaterial('#6b7a94', { metal: 0.4, rough: 0.5 });
    p.sub.add(kit.box(0.09, 0.006, 0.12, padMat));
    [-0.035, 0, 0.035].forEach((z) => {
      const t = kit.box(0.024, 0.032, 0.02, metalMat);
      t.position.set(-0.012, 0.006, z);
      p.sub.add(t);
    });
    const pylon = kit.cylinder(0.002, 0.004, 0.08, kit.sharedMaterial('#c9d3e6'), 10);
    pylon.position.set(0.025, 0.006, 0);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.007, 12, 8), kit.sharedMaterial(PAL.power, { emissive: PAL.power, emissiveIntensity: 0.8 }));
    beacon.position.set(0.025, 0.09, 0);
    p.sub.add(pylon, beacon);
    root.add(p.sub);

    const powerMat = kit.sharedMaterial(PAL.power, { emissive: PAL.power, emissiveIntensity: 0.5 });
    p.extLine = kit.box(1, 0.004, 0.004, powerMat);
    p.extLine.position.y = 0.03;
    p.intLine = kit.box(1, 0.004, 0.004, powerMat);
    p.intLine.position.y = 0.03;
    p.extCurve = new THREE.LineCurve3(new THREE.Vector3(-0.48, 0.032, 0), new THREE.Vector3(-0.3, 0.032, 0));
    p.intCurve = new THREE.LineCurve3(new THREE.Vector3(-0.2, 0.032, 0), new THREE.Vector3(-0.1, 0.032, 0));
    p.extFlow = kit.flowParticles(p.extCurve, { count: 8, color: PAL.power, size: 0.0045, speed: 0.35 });
    p.intFlow = kit.flowParticles(p.intCurve, { count: 5, color: PAL.power, size: 0.0045, speed: 0.5 });
    p.extFlow.object.frustumCulled = false;
    p.intFlow.object.frustumCulled = false;
    p.flows.push(p.extFlow, p.intFlow);
    root.add(p.extLine, p.intLine, p.extFlow.object, p.intFlow.object);

    // Cooling plant that matches the site's cooling type.
    p.plant = m.cooling === 'airEvap' ? buildEvap(p) : buildDry();
    root.add(p.plant);

    // Nearby known AI campuses as labelled ghost blocks along the front edge.
    const near = existing.filter((d) => d.nearSite === sid);
    near.forEach((dc, i) => {
      const sN = Math.sqrt(clamp01(num(dc.mw) / maxCampusMW));
      const w = 0.05 + 0.1 * sN;
      const h = 0.02 + 0.07 * sN;
      const d = w * 0.7;
      const blk = kit.box(1, 1, 1, kit.ghostMaterial(PAL.warn, 0.24));
      blk.add(new THREE.LineSegments(new THREE.EdgesGeometry(blk.geometry), lineMat(PAL.warn, 0.8)));
      const x = (i - (near.length - 1) / 2) * 0.34;
      blk.scale.set(w, h, d);
      blk.position.set(x, 0.006, 0.36);
      const lbl = makeLabel(`${shortName(dc.name)}\n${fmt.mw(dc.mw)}${dc.mwNote ? ` ${dc.mwNote}` : ''}`, { size: 0.012 });
      lbl.position.set(x, 0.006 + h + 0.035, 0.36);
      root.add(blk, lbl);
    });

    p.bldgLabel = makeLabel(m.name || sid, { size: 0.016 });
    p.gridLabel = makeLabel('Grid', { size: 0.013, color: PAL.power });
    p.plantLabel = makeLabel('Cooling', { size: 0.012 });
    root.add(p.bldgLabel, p.gridLabel, p.plantLabel);
    schematicNote(root);
    return p;
  }

  function placeEarth(p, m, M) {
    const T = M.totals || {};
    const on = m.enabled !== false && num(m.facilityMW) > 0;
    const ref = Math.max(num(T.gridCapMW), num(m.facilityMW), 100);
    const s = on ? Math.sqrt(clamp01(num(m.facilityMW) / ref)) : 0;
    const W = 0.14 + 0.24 * s;
    const D = W * 0.62;
    const H = 0.04 + 0.12 * s;

    p.bldg.visible = on;
    p.bldg.scale.set(W, H, D);
    p.bldg.position.set(0, 0.006, 0);
    p.slabs.visible = on && p.nHalls > 0;
    // A switched-off site has nothing to pick: hidden objects must not catch rays either.
    p.bldg.raycast = on ? meshRaycast : noop;
    p.slabs.raycast = p.slabs.visible ? instRaycast : noop;
    const sk = `${p.nHalls}|${W.toFixed(4)}`;
    if (p.nHalls > 0 && sk !== p.slabKey) {
      p.slabKey = sk;
      const lay = kit.gridLayout(p.nHalls, W * 0.92, D * 0.92, { gap: 0.18 });
      lay.positions.forEach((q, i) => kit.setInstance(p.slabs, i, { x: q.x, y: 0.007, z: q.z, sx: q.w, sy: 0.006, sz: q.d, color: WHITE }));
      kit.instancesDone(p.slabs);
    }

    const spec = earthSpec(cur.lens, M, catalog, kit);
    const c = on ? kit.ramp(cur.lens, kit.norm(num(spec.get(m)), spec.lo, spec.hi)) : GREY;
    p.ghostMat.color.copy(c);
    p.edgeMat.color.copy(c);
    p.slabMat.color.copy(c);
    p.terrainMat.color.copy(COLD).lerp(DESERT, clamp01(m.climate));
    if (p.tankMat) p.tankMat.color.copy(cur.lens === 'water' ? c : WATERC);

    // Substation left of the building, cooling plant to its right, grid line from the table edge.
    const xs = -(W / 2 + 0.13);
    p.sub.position.set(xs, 0.006, 0);
    const extLen = Math.max(0.04, xs - 0.045 + 0.48);
    p.extLine.scale.x = extLen;
    p.extLine.position.x = -0.48 + extLen / 2;
    p.extCurve.v2.set(xs - 0.045, 0.032, 0);
    const intStart = xs + 0.045;
    const intEnd = -W / 2;
    const intLen = Math.max(0.01, intEnd - intStart);
    p.intLine.scale.x = intLen;
    p.intLine.position.x = intStart + intLen / 2;
    p.intCurve.v1.set(intStart, 0.032, 0);
    p.intCurve.v2.set(intEnd, 0.032, 0);
    p.extFlow.setRate(on ? 0.6 + 1.2 * s : 0);
    p.intFlow.setRate(on ? 0.6 + 1.2 * s : 0);
    const xc = W / 2 + 0.15;
    p.plant.position.set(xc, 0.006, 0);

    p.bldgLabel.position.set(0, 0.006 + H + 0.05, 0);
    p.gridLabel.position.set(-0.48 + extLen / 2, 0.075, 0);
    p.plantLabel.position.set(xc, 0.006 + 0.16, 0);
    putText(p.bldgLabel, on
      ? `${m.name || 'Site'}\n${fmt.mw(m.facilityMW)} facility, ${fmt.num(m.halls)} ${num(m.halls) === 1 ? 'hall' : 'halls'}`
      : `${m.name || 'Site'} is switched off or holds no racks`);
    putText(p.gridLabel, `Grid ${fmt.mw(m.allocMW)}`);
    const cool = catalog.cooling && catalog.cooling[m.cooling] ? catalog.cooling[m.cooling].label : String(m.cooling || 'Cooling');
    putText(p.plantLabel, `${cool}\n${m.cooling === 'airEvap' ? `${fmt.ml(m.waterMLPerYear)} of water a year` : 'No water used'}`);
  }

  // ---------- LEO ----------

  function buildLeo(sid, m) {
    const on = m.enabled !== false;
    const n = satCount(m);
    const root = new THREE.Group();
    const p = { kind: 'leo', root, flows: [], pickables: [], on, n, sats: [] };

    p.earthG = earthBall(0.1);
    p.earthG.position.set(0, 0.14, 0);
    root.add(p.earthG);

    const pivot = new THREE.Group();
    pivot.position.set(0, 0.14, 0);
    pivot.rotation.set(1.25, 0, 0);
    pivot.add(kit.line(circlePoints(RING_R, 64), { color: PAL.leo, opacity: 0.4 }));
    p.spin = new THREE.Group();
    pivot.add(p.spin);
    root.add(pivot);

    p.radMat = on ? kit.material('#ffffff', { rough: 0.5 }) : kit.ghostMaterial('#9aa4b8', 0.2);
    const solMat = on ? kit.material('#1c3a6e', { metal: 0.6, rough: 0.3 }) : kit.ghostMaterial('#1c3a6e', 0.2);
    const busMat = on ? kit.material('#c6d3e6', { metal: 0.5, rough: 0.4 }) : kit.ghostMaterial('#c6d3e6', 0.2);
    const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    const pick = { level: 'rack', id: 'decode', label: 'Orbital compute' };

    for (let i = 0; i < n; i++) {
      const a = Math.PI / 2 + (i - (n - 1) / 2) * 0.2;
      const sat = new THREE.Group();
      sat.position.set(RING_R * Math.cos(a), RING_R * Math.sin(a), 0);
      const bus = kit.box(0.02, 0.014, 0.02, busMat);
      bus.position.y = -0.007;
      const radA = kit.box(1, 1, 1, p.radMat);
      const radB = kit.box(1, 1, 1, p.radMat);
      const solA = kit.box(1, 1, 1, solMat);
      const solB = kit.box(1, 1, 1, solMat);
      const hit = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 6), hitMat);
      sat.add(bus, radA, radB, solA, solB, hit);
      if (on) sat.userData.pick = pick;
      p.spin.add(sat);
      p.sats.push({ radA, radB, solA, solB });
    }
    if (on) p.pickables = p.spin.children.slice();

    p.label = makeLabel(m.name || sid, { size: 0.015 });
    p.label.position.set(0, 0.42, 0);
    root.add(p.label);
    schematicNote(root);
    return p;
  }

  function placeLeo(p, m, M) {
    const spec = offSpec(cur.lens, M, kit);
    const c = p.on ? kit.ramp(cur.lens, kit.norm(num(spec.get(m)), spec.lo, spec.hi)) : GREY;
    p.radMat.color.copy(c);
    // Total drawn wing area follows radiator area (heat) and IT power (solar); counts stay fixed until a bucket changes.
    const S = 0.002 + 0.04 * kit.norm(num(m.radiatorM2), 1e3, 1e6, { log: true });
    const S2 = 0.002 + 0.03 * kit.norm(num(m.itMW), 1, 1000, { log: true });
    const per = S / (2 * Math.max(1, p.n));
    const wl = Math.sqrt(per / 0.6);
    const wd = wl * 0.6;
    const per2 = S2 / (2 * Math.max(1, p.n));
    const sl = Math.sqrt(per2 / 0.7);
    const sw = sl * 0.7;
    for (const s of p.sats) {
      s.radA.scale.set(0.003, wd, wl);
      s.radA.position.set(0, -wd / 2, 0.01 + wl / 2);
      s.radB.scale.set(0.003, wd, wl);
      s.radB.position.set(0, -wd / 2, -(0.01 + wl / 2));
      s.solA.scale.set(sw, sl, 0.003);
      s.solA.position.set(0, 0.01, 0);
      s.solB.scale.set(sw, sl, 0.003);
      s.solB.position.set(0, -(0.01 + sl), 0);
    }
    putText(p.label, p.on
      ? `${m.name || 'Low Earth orbit'}\n${fmt.mw(m.itMW)} IT, radiators ${fmt.num(m.radiatorM2)} m2\nLaunch mass ${fmt.t(m.launchMassT)}`
      : `${m.name || 'Low Earth orbit'} is switched off in the scenario`);
  }

  // ---------- Moon and Mars ----------

  function buildSurface(sid, m) {
    const on = m.enabled !== false;
    const n = panelCount(m);
    const root = new THREE.Group();
    const p = { kind: 'surface', root, flows: [], pickables: [], on, n };

    const ground = sid === 'moon' ? '#6f6c64' : '#7a4630';
    root.add(kit.cylinder(0.44, 0.46, 0.012, kit.material(ground, { rough: 0.95, metal: 0 }), 48));
    const rimMat = kit.material(sid === 'moon' ? '#8a867c' : '#99573a', { rough: 0.95, metal: 0 });
    [[-0.3, -0.05, 0.06], [0.34, -0.2, 0.05], [-0.32, 0.18, 0.05]].forEach((c) => {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(c[2], 0.005, 6, 28), rimMat);
      rim.rotation.x = Math.PI / 2;
      rim.position.set(c[0], 0.014, c[1]);
      root.add(rim);
    });

    // Radiator field: one InstancedMesh of flat panels.
    p.radMat = on ? kit.material('#ffffff', { rough: 0.5 }) : kit.ghostMaterial('#9aa4b8', 0.2);
    p.panels = kit.instancedBoxes(n, p.radMat);
    const lay = kit.gridLayout(n, 0.66, 0.36, { gap: 0.3 });
    lay.positions.forEach((q, i) => kit.setInstance(p.panels, i, { x: q.x, y: 0.012, z: q.z + 0.08, sx: q.w, sy: 0.004, sz: q.d, color: WHITE }));
    kit.instancesDone(p.panels);
    root.add(p.panels);

    // Compute cluster at the back of the patch.
    const cluster = new THREE.Group();
    const modMat = on ? kit.sharedMaterial(PAL.gpu, { rough: 0.4, metal: 0.3 }) : kit.ghostMaterial(PAL.gpu, 0.2);
    for (let i = 0; i < 4; i++) {
      const mod = kit.box(0.07, 0.05, 0.05, modMat);
      mod.position.set((i - 1.5) * 0.09, 0.012, 0);
      cluster.add(mod);
    }
    const hit = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    hit.position.y = 0.04;
    cluster.add(hit);
    cluster.position.set(0, 0, -0.3);
    if (on) cluster.userData.pick = { level: 'rack', id: 'decode', label: 'Surface compute' };
    root.add(cluster);
    if (on) p.pickables = [cluster];

    p.label = makeLabel(m.name || sid, { size: 0.015 });
    p.label.position.set(0, 0.17, -0.3);
    root.add(p.label);
    schematicNote(root);
    return p;
  }

  function placeSurface(p, m, M) {
    const spec = offSpec(cur.lens, M, kit);
    const c = p.on ? kit.ramp(cur.lens, kit.norm(num(spec.get(m)), spec.lo, spec.hi)) : GREY;
    p.radMat.color.copy(c);
    putText(p.label, p.on
      ? `${m.name} surface patch\n${fmt.mw(m.itMW)} IT, radiators ${fmt.num(m.radiatorM2)} m2\nLaunch mass ${fmt.t(m.launchMassT)}, launch ${fmt.usd(m.launchUSD)}`
      : `${m.name} is switched off in the scenario`);
  }

  // ---------- lifecycle ----------

  function rebuild(sid, m, key) {
    if (content) { group.remove(content); kit.dispose(content); }
    parts = m.kind === 'earth' ? buildEarth(sid, m) : m.kind === 'leo' ? buildLeo(sid, m) : buildSurface(sid, m);
    content = parts.root;
    inert(content);
    group.add(content);
    cur.key = key;
  }

  function update(state, metrics, lens) {
    if (metrics) cur.metrics = metrics;
    if (lens) cur.lens = lens;
    else if (state && state.view && state.view.lens) cur.lens = state.view.lens;
    cur.focus = focusIdOf(state);
    const M = cur.metrics;
    if (!M || !M.sites) return;
    const m = M.sites[cur.focus];
    if (!m) return;
    const key = keyFor(cur.focus, m);
    if (!parts || key !== cur.key) rebuild(cur.focus, m, key);
    if (parts.kind === 'earth') placeEarth(parts, m, M);
    else if (parts.kind === 'leo') placeLeo(parts, m, M);
    else placeSurface(parts, m, M);
  }

  function tick(dt) {
    if (!parts) return;
    const d = Math.min(0.1, num(dt));
    for (const f of parts.flows) f.tick(d);
    if (parts.spin) parts.spin.rotation.z += d * 0.12;
    if (parts.earthG) parts.earthG.rotation.y += d * 0.05;
  }

  function pickables() {
    return parts ? parts.pickables.filter((o) => o.visible !== false) : [];
  }

  function kindOf(sid, M) {
    if (M && M.sites && M.sites[sid]) return M.sites[sid].kind;
    return OFFWORLD_KINDS.indexOf(sid) >= 0 ? sid : 'earth';
  }

  function legend(lens, state, metrics) {
    const L = lens || cur.lens;
    const M = metrics || cur.metrics;
    const kind = kindOf(focusIdOf(state), M);
    const spec = specFor(L, kind, M, catalog, kit);
    const extra = kind === 'earth'
      ? ' Building footprint and height grow with facility MW, schematic, not to scale. Amber ghost blocks are known AI campuses nearby (ext.existing).'
      : ' Wing, radiator and patch sizes are schematic, not to scale.';
    return { title: spec.title, items: specItems(L, spec, kit), note: `${spec.note}${extra}` };
  }

  function readout(state, metrics) {
    const M = metrics || cur.metrics;
    const sid = focusIdOf(state);
    const m = M && M.sites ? M.sites[sid] : null;
    if (!m) return [];
    const cat = catalog.sites && catalog.sites[sid] ? catalog.sites[sid] : {};
    if (m.kind === 'earth') {
      const racks = m.racks || {};
      const sent = m.sentiment || {};
      return [
        { label: 'Facility power', value: fmt.mw(m.facilityMW), unit: '', sourceId: 'd.facility' },
        { label: 'IT power', value: fmt.mw(m.itMW), unit: '', sourceId: 'd.facility' },
        { label: 'Grid share', value: fmt.mw(m.allocMW), unit: '', sourceId: 'a.alloc' },
        { label: 'PUE', value: Number.isFinite(m.pue) ? m.pue.toFixed(2) : 'n/a', unit: '', sourceId: 's15.pue' },
        { label: 'Racks', value: fmt.num(num(racks.prefill) + num(racks.decode)), unit: `racks (${fmt.num(racks.prefill)} prefill, ${fmt.num(racks.decode)} decode)`, sourceId: 'd.capacity' },
        { label: 'Halls', value: fmt.num(m.halls), unit: 'halls', sourceId: 'a.hall_racks' },
        { label: 'Energy price', value: fmt.usd(m.priceUSDPerMWh), unit: '/MWh', sourceId: srcOr(cat.src_priceUSDPerMWh, 'spec.energy_price') },
        { label: 'Grid carbon', value: fmt.num(m.carbonKgPerMWh, 0), unit: 'kg CO2/MWh', sourceId: srcOr(cat.src_carbonKgPerMWh, 'ext.eia_co2') },
        { label: 'Cooling water', value: fmt.ml(m.waterMLPerYear), unit: 'a year', sourceId: 'd.water' },
        { label: 'Local sentiment', value: String(sent.label || 'n/a'), unit: '', sourceId: 'ext.sentiment' },
        { label: 'Round trip to users', value: fmt.ms(m.rttMs), unit: '', sourceId: 's13.rtt' },
      ];
    }
    const rows = [
      { label: 'IT power', value: fmt.mw(m.itMW), unit: '', sourceId: 'd.facility' },
      { label: 'Racks', value: fmt.num(num(m.racks && m.racks.prefill) + num(m.racks && m.racks.decode)), unit: 'racks', sourceId: 'd.capacity' },
      { label: 'Round trip to users', value: fmt.ms(m.rttMs), unit: '', sourceId: 's13.rtt' },
      { label: 'Radiator area', value: fmt.num(m.radiatorM2), unit: 'm2', sourceId: 'd.radiator' },
      { label: 'Launch mass', value: fmt.t(m.launchMassT), unit: '', sourceId: 'd.launch' },
      { label: 'Launch cost', value: fmt.usd(m.launchUSD), unit: '', sourceId: 'd.launch' },
      { label: 'Launch cost multiplier', value: `${fmt.num(m.launchMult)}x`, unit: 'vs low Earth orbit', sourceId: 's15.orbit' },
      { label: 'Interactive work', value: m.servesInteractive ? 'Yes' : 'No, background only', unit: '', sourceId: 'a.interactive_split' },
    ];
    if (m.sentiment && m.sentiment.items && m.sentiment.items.length) {
      rows.push({ label: 'News stance', value: String(m.sentiment.label || 'n/a'), unit: '', sourceId: 'ext.sentiment' });
    }
    return rows;
  }

  function caption(state, metrics) {
    const M = metrics || cur.metrics;
    const sid = focusIdOf(state);
    const m = M && M.sites ? M.sites[sid] : null;
    if (!m) return 'This site is waiting for the model to run.';
    if (m.kind === 'earth') {
      if (m.enabled === false) return `${m.name} is switched off in the scenario, so nothing is built here.`;
      return `${m.name} draws ${fmt.mw(m.facilityMW)} across ${fmt.num(m.halls)} ${num(m.halls) === 1 ? 'hall' : 'halls'} at PUE ${Number.isFinite(m.pue) ? m.pue.toFixed(2) : 'n/a'}, from a ${fmt.mw(m.allocMW)} share of the grid.`;
    }
    if (m.enabled === false) return `${m.name} is switched off; turn it on in the scenario panel to see its radiators and launch mass.`;
    return `${m.name} holds ${fmt.mw(m.itMW)} of compute behind ${fmt.num(m.radiatorM2)} m2 of radiators, with a ${fmt.ms(m.rttMs)} round trip and ${fmt.t(m.launchMassT)} to launch.`;
  }

  function dispose() {
    kit.dispose(group);
    parts = null;
    content = null;
  }

  if (cur.metrics) update(app ? app.state : null, cur.metrics, cur.lens);

  return { group, update, pickables, tick, legend, readout, caption, dispose };
}
