// Earth fleet level (Module 1, Business).
// A slowly turning globe on the table with six Earth site pins, known AI campuses as small diamonds,
// an optional layer of Cleanview markers (only when the build ships them) and a grid gauge ring.
// Schematic: pin height is facility MW on a log scale, not a measured size.

import { SITE_IDS } from '../contract.js';

export const id = 'fleet';

const GLOBE_R = 0.26;
const GLOBE_Y = 0.29;
const PIN_MIN = 0.012;
const PIN_MAX = 0.036;
const PIN_OFF = 0.006;
const SPIN = 0.07;
const GAUGE_R = 0.31;
const GAUGE_N = 120;
const LABEL_LIFT = { mid: 0.03 };
const noop = () => {};

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

/** What each lens means for an Earth site: value getter, scale, formatter, text. */
function lensSpec(lens, metrics, catalog, kit) {
  const fmt = kit.fmt;
  const list = earthList(metrics);
  const col = (fn) => list.map(fn).filter((v) => Number.isFinite(v));
  const minOf = (a, d) => (a.length ? Math.min(...a) : d);
  const maxOf = (a, d) => (a.length ? Math.max(...a) : d);
  if (lens === 'power') {
    return { title: 'Power: facility MW per site', get: (m) => m.facilityMW, lo: 0, hi: maxOf(col((m) => m.facilityMW), 0),
      fmtV: (v) => fmt.mw(v), note: 'Colour is facility power, IT power times PUE. Source d.facility.' };
  }
  if (lens === 'cost') {
    const prices = col((m) => m.priceUSDPerMWh);
    return { title: 'Cost: energy price per site', get: (m) => m.priceUSDPerMWh, lo: minOf(prices, 0), hi: maxOf(prices, 0),
      fmtV: (v) => `${fmt.usd(v)}/MWh`, note: 'Colour is the industrial energy price per MWh. Sources ext.eia_price, ext.ssb_price, tw.sites.' };
  }
  if (lens === 'sentiment') {
    return { title: 'Sentiment: local news stance', get: (m) => (m.sentiment && Number.isFinite(m.sentiment.score) ? m.sentiment.score : 0), lo: -2, hi: 2,
      fmtV: () => '', note: 'Colour is the stance of one recent local news article per site. A sample, not a poll. Source ext.sentiment.' };
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

function specItems(lens, spec, kit) {
  if (lens === 'sentiment') {
    return [{ color: kit.rampHex('sentiment', 0), label: 'Mostly opposed' }, { color: kit.rampHex('sentiment', 0.5), label: 'Mixed' },
      { color: kit.rampHex('sentiment', 1), label: 'Mostly supportive' }];
  }
  if (!(spec.hi > spec.lo)) return [{ color: kit.rampHex(lens, 0), label: spec.fmtV(spec.lo) }];
  return kit.legendSteps(lens, spec.lo, spec.hi, spec.fmtV, 5);
}

function statusColor(status) {
  const s = String(status || '').toLowerCase();
  if (s.indexOf('operat') >= 0) return '#e8edf5';
  if (s.indexOf('construct') >= 0) return '#ffb547';
  return '#c9a7ff';
}

export function create(ctx) {
  const THREE = ctx.THREE;
  const kit = ctx.kit;
  const app = ctx.app || null;
  const data = ctx.data || {};
  const catalog = data.catalog || {};
  const fmt = kit.fmt;
  const PAL = kit.PALETTE;
  const landDots = Array.isArray(data.landDots) ? data.landDots : [];
  const existing = Array.isArray(data.existingDCs) ? data.existingDCs : [];
  const cv = data.cleanview || {};
  const cvTotals = cv.totals || catalog.cleanview || {};

  const group = new THREE.Group();
  group.name = 'fleet';
  const cur = { metrics: app && app.metrics ? app.metrics : null, lens: app && app.state && app.state.view ? app.state.view.lens : 'heat' };

  // ---------- globe ----------
  const globe = new THREE.Group();
  globe.position.set(0, GLOBE_Y, 0);
  group.add(globe);

  const ocean = new THREE.Mesh(new THREE.SphereGeometry(GLOBE_R * 0.99, 48, 32), kit.material('#10243f', { rough: 0.9, metal: 0 }));
  globe.add(ocean);

  const tmp = new THREE.Vector3();
  const landPos = [];
  for (const d of landDots) {
    if (!d || !Number.isFinite(d[0]) || !Number.isFinite(d[1])) continue;
    kit.latLonToVec3(d[0], d[1], GLOBE_R, tmp);
    landPos.push([tmp.x, tmp.y, tmp.z]);
  }
  if (landPos.length) globe.add(kit.dots(landPos, { size: 2.2, color: PAL.land }));

  // Cleanview markers: only when the build ships them (markers is null in the public build).
  let cvDrawn = 0;
  const markers = Array.isArray(cv.markers) ? cv.markers : null;
  if (markers && markers.length) {
    const pos = [];
    const cols = [];
    const cOp = new THREE.Color('#7ee0ff');
    const cPl = new THREE.Color('#ffb547');
    for (const row of markers) {
      if (!row || !Number.isFinite(row[1]) || !Number.isFinite(row[2])) continue;
      kit.latLonToVec3(row[1], row[2], GLOBE_R + 0.002, tmp);
      pos.push([tmp.x, tmp.y, tmp.z]);
      const c = String(row[3] || '').toLowerCase().indexOf('operat') >= 0 ? cOp : cPl;
      cols.push([c.r, c.g, c.b]);
    }
    cvDrawn = pos.length;
    if (cvDrawn) globe.add(kit.dots(pos, { size: 2.6, colors: cols }));
  }

  // ---------- site pins ----------
  const Y = new THREE.Vector3(0, 1, 0);
  const pins = {};
  const geoOf = (sid) => {
    const c = catalog.sites && catalog.sites[sid];
    if (c && Number.isFinite(c.lat) && Number.isFinite(c.lon)) return c;
    const m = app && app.metrics && app.metrics.sites ? app.metrics.sites[sid] : null;
    return m && Number.isFinite(m.lat) && Number.isFinite(m.lon) ? m : null;
  };
  for (const sid of SITE_IDS) {
    const geo = geoOf(sid);
    if (!geo) continue;
    const name = geo.name || sid;
    const normal = kit.latLonToVec3(geo.lat, geo.lon, 1);
    const root = new THREE.Group();
    root.position.copy(normal).multiplyScalar(GLOBE_R);
    root.quaternion.setFromUnitVectors(Y, normal);
    const mat = kit.material('#9aa4b8', { emissive: '#9aa4b8', emissiveIntensity: 0.35 });
    const pillar = kit.cylinder(0.0045, 0.006, 1, mat, 12);
    pillar.scale.y = PIN_MIN;
    const hit = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    hit.position.y = 0.014;
    root.add(pillar, hit);
    const pick = { level: 'site', id: sid, label: name };
    root.userData.pick = pick;
    pillar.userData.pick = pick;
    hit.userData.pick = pick;
    const label = kit.label(name, { size: 0.0135 });
    label.userData.lastText = name;
    globe.add(root, label);
    pins[sid] = { root, pillar, hit, label, mat, normal, h: PIN_MIN };
    label.position.copy(normal).multiplyScalar(GLOBE_R + PIN_MIN + 0.02 + (LABEL_LIFT[sid] || 0));
  }

  // ---------- known AI campuses (small diamonds, labels on hover or gaze) ----------
  const dcNormals = [];
  const dcLabels = [];
  const dcMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: '#ffffff' }), Math.max(1, existing.length));
  dcMesh.count = existing.length;
  dcMesh.visible = existing.length > 0;
  dcMesh.raycast = noop;
  {
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3(0.0065, 0.009, 0.0065);
    const p = new THREE.Vector3();
    existing.forEach((dc, i) => {
      const n = kit.latLonToVec3(num(dc.lat), num(dc.lon), 1);
      dcNormals.push(n);
      p.copy(n).multiplyScalar(GLOBE_R + 0.006);
      q.setFromUnitVectors(Y, n);
      dcMesh.setMatrixAt(i, m4.compose(p, q, sc));
      dcMesh.setColorAt(i, new THREE.Color(statusColor(dc.status)));
      const text = `${shortName(dc.name)}\n${fmt.mw(dc.mw)}${dc.mwNote ? ` ${dc.mwNote}` : ''}`;
      const lbl = kit.label(text, { size: 0.0115, color: PAL.ink });
      lbl.position.copy(n).multiplyScalar(GLOBE_R + 0.05);
      lbl.visible = false;
      globe.add(lbl);
      dcLabels.push(lbl);
    });
    dcMesh.instanceMatrix.needsUpdate = true;
    if (dcMesh.instanceColor) dcMesh.instanceColor.needsUpdate = true;
    dcMesh.computeBoundingSphere();
  }
  globe.add(dcMesh);

  // ---------- LEO ring (only when an off-world site is enabled) ----------
  const leoGroup = new THREE.Group();
  leoGroup.position.set(0, GLOBE_Y, 0);
  leoGroup.rotation.set(1.25, 0, 0.3);
  leoGroup.visible = false;
  {
    const pts = [];
    for (let i = 0; i <= 64; i++) { const a = (i / 64) * Math.PI * 2; pts.push([GLOBE_R * 1.3 * Math.cos(a), GLOBE_R * 1.3 * Math.sin(a), 0]); }
    leoGroup.add(kit.line(pts, { color: PAL.leo, opacity: 0.45 }));
  }
  const leoSat = new THREE.Mesh(new THREE.SphereGeometry(0.006, 10, 8), kit.material(PAL.leo, { emissive: PAL.leo, emissiveIntensity: 0.8 }));
  leoGroup.add(leoSat);
  const leoLabel = kit.label('Off-world', { size: 0.012, color: PAL.leo });
  leoLabel.userData.lastText = 'Off-world';
  leoLabel.position.set(0, GLOBE_R * 1.3 + 0.02, 0);
  leoGroup.add(leoLabel);
  group.add(leoGroup);

  // ---------- grid gauge ring: arc length = Earth facility MW / grid cap ----------
  const gauge = kit.instancedBoxes(GAUGE_N * 2, kit.material('#ffffff', { rough: 0.5 }));
  gauge.raycast = noop;
  group.add(gauge);
  const gaugeLabel = kit.label('Grid', { size: 0.013 });
  gaugeLabel.userData.lastText = 'Grid';
  gaugeLabel.position.set(0, 0.03, GAUGE_R + 0.04);
  group.add(gaugeLabel);
  const noteLabel = kit.label('Schematic, not to scale', { size: 0.0105, color: PAL.dim, bg: null });
  noteLabel.position.set(0, 0.012, 0.44);
  group.add(noteLabel);

  const C_EMPTY = new THREE.Color('#2a3446');
  const C_OK = new THREE.Color(PAL.ok);
  const C_WARN = new THREE.Color(PAL.warn);
  const C_FAIL = new THREE.Color(PAL.fail);
  const segLen = ((2 * Math.PI * GAUGE_R) / GAUGE_N) * 0.82;
  let gaugeKey = '';

  function updateGauge(earthMW, capMW) {
    const f = capMW > 0 ? earthMW / capMW : 0;
    const base = Math.round(clamp01(f) * GAUGE_N);
    const over = f > 1 ? Math.round(clamp01(f - 1) * GAUGE_N) : 0;
    const tone = f > 1 ? 'fail' : f > 0.95 ? 'warn' : 'ok';
    const key = `${base}|${over}|${tone}`;
    if (key === gaugeKey) return;
    gaugeKey = key;
    const fill = tone === 'fail' ? C_FAIL : tone === 'warn' ? C_WARN : C_OK;
    for (let i = 0; i < GAUGE_N; i++) {
      const a = (i / GAUGE_N) * Math.PI * 2;
      const x = GAUGE_R * Math.sin(a);
      const z = GAUGE_R * Math.cos(a);
      kit.setInstance(gauge, i, { x, y: 0.002, z, sx: segLen, sy: 0.006, sz: 0.01, rotY: a, color: i < base ? fill : C_EMPTY });
      if (i < over) kit.setInstance(gauge, GAUGE_N + i, { x, y: 0.0085, z, sx: segLen, sy: 0.006, sz: 0.01, rotY: a, color: C_FAIL });
      else kit.setInstance(gauge, GAUGE_N + i, { x, y: 0, z, sx: 0.0001, sy: 0.0001, sz: 0.0001, color: C_FAIL });
    }
    kit.instancesDone(gauge);
  }

  inert(group);

  // ---------- pointer state: spin pauses while a pointer is down; hover reveals campus labels ----------
  const pointer = { x: 0, y: 0, seen: false };
  let pointerDown = false;
  const onMove = (e) => { pointer.x = e.clientX; pointer.y = e.clientY; pointer.seen = true; };
  const onDown = () => { pointerDown = true; };
  const onUp = () => { pointerDown = false; };
  const hasWin = typeof window !== 'undefined' && !!window.addEventListener;
  if (hasWin) {
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    window.addEventListener('pointercancel', onUp, { passive: true });
    window.addEventListener('blur', onUp);
  }

  // The camera and renderer are learned from the render pass (the level has no direct stage handle).
  let cam = null;
  let rend = null;
  ocean.onBeforeRender = (renderer, scene, camera) => { rend = renderer; cam = camera; };

  const camPos = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const wA = new THREE.Vector3();
  const wC = new THREE.Vector3();
  const wN = new THREE.Vector3();

  function hideLabels() { for (const l of dcLabels) l.visible = false; }

  function updateHover() {
    if (!cam || existing.length === 0) { hideLabels(); return; }
    const presenting = !!(rend && rend.xr && rend.xr.isPresenting);
    let rect = null;
    if (!presenting) {
      const dom = rend && rend.domElement;
      if (!dom || !pointer.seen) { hideLabels(); return; }
      rect = dom.getBoundingClientRect();
      if (pointer.x < rect.left || pointer.x > rect.right || pointer.y < rect.top || pointer.y > rect.bottom) { hideLabels(); return; }
    }
    globe.updateWorldMatrix(true, false);
    globe.getWorldPosition(wC);
    cam.getWorldPosition(camPos);
    cam.getWorldDirection(fwd);
    let best = -1;
    let bestScore = presenting ? 0.985 : -42;
    for (let i = 0; i < existing.length; i++) {
      wA.copy(dcNormals[i]).multiplyScalar(GLOBE_R + 0.006).applyMatrix4(globe.matrixWorld);
      wN.copy(wA).sub(wC).normalize();
      wA.sub(camPos);
      const len = wA.length() || 1;
      if (wN.dot(wA) / len > 0.05) continue;
      let score;
      if (presenting) {
        score = fwd.dot(wA) / len;
      } else {
        wA.add(camPos).project(cam);
        const px = rect.left + (wA.x * 0.5 + 0.5) * rect.width;
        const py = rect.top + (-wA.y * 0.5 + 0.5) * rect.height;
        score = -Math.hypot(px - pointer.x, py - pointer.y);
      }
      if (score > bestScore) { best = i; bestScore = score; }
    }
    for (let i = 0; i < dcLabels.length; i++) dcLabels[i].visible = i === best;
  }

  const putText = (sprite, text) => {
    if (sprite.userData.lastText !== text) { sprite.userData.setText(text); sprite.userData.lastText = text; }
  };

  // ---------- update: restyle only; nothing is rebuilt (the six pins never change count) ----------
  function update(state, metrics, lens) {
    if (metrics) cur.metrics = metrics;
    if (lens) cur.lens = lens;
    else if (state && state.view && state.view.lens) cur.lens = state.view.lens;
    const M = cur.metrics;
    if (!M || !M.sites) return;
    const T = M.totals || {};
    const spec = lensSpec(cur.lens, M, catalog, kit);
    const ref = Math.max(num(T.gridCapMW), 10, ...earthList(M).map((m) => num(m.facilityMW)));
    for (const sid of SITE_IDS) {
      const pin = pins[sid];
      const m = M.sites[sid];
      if (!pin || !m) continue;
      const on = m.enabled !== false;
      const t = on ? kit.norm(num(m.facilityMW), 1, ref, { log: true }) : 0;
      pin.h = on ? PIN_MIN + (PIN_MAX - PIN_MIN) * t : PIN_OFF;
      pin.pillar.scale.y = pin.h;
      pin.hit.position.y = pin.h * 0.5 + 0.008;
      const c = on ? kit.ramp(cur.lens, kit.norm(num(spec.get(m)), spec.lo, spec.hi)) : new THREE.Color('#4a5468');
      pin.mat.color.copy(c);
      pin.mat.emissive.copy(on ? c : new THREE.Color('#000000'));
      pin.label.position.copy(pin.normal).multiplyScalar(GLOBE_R + pin.h + 0.02 + (LABEL_LIFT[sid] || 0));
      putText(pin.label, on ? `${m.name || sid} ${fmt.mw(m.facilityMW)}` : `${m.name || sid} off`);
    }
    const offOn = ['leo', 'moon', 'mars'].some((k) => M.sites[k] && M.sites[k].enabled);
    leoGroup.visible = offOn;
    if (offOn) putText(leoLabel, `Off-world ${fmt.mw(T.offworldITMW)} IT`);
    updateGauge(num(T.earthFacilityMW), num(T.gridCapMW));
    putText(gaugeLabel, `Grid ${fmt.mw(T.earthFacilityMW)} of ${fmt.mw(T.gridCapMW)}`);
  }

  function tick(dt) {
    const d = Math.min(0.1, num(dt));
    if (!pointerDown) globe.rotation.y += SPIN * d;
    if (leoGroup.visible) {
      leoSatAngle += d * 0.4;
      leoSat.position.set(GLOBE_R * 1.3 * Math.cos(leoSatAngle), GLOBE_R * 1.3 * Math.sin(leoSatAngle), 0);
    }
    updateHover();
  }
  let leoSatAngle = 0;

  function legend(lens, state, metrics) {
    const L = lens || cur.lens;
    const spec = lensSpec(L, metrics || cur.metrics, catalog, kit);
    const cvNote = cvDrawn ? ' Small dots are Cleanview US markers (cyan operating, amber planned), source cv.map.' : '';
    return {
      title: spec.title,
      items: specItems(L, spec, kit),
      note: `${spec.note} Pin height is facility MW on a log scale, schematic, not to scale. A grey stub is a site switched off. Diamonds are known AI campuses (white operating, amber under construction, violet planned), source ext.existing.${cvNote}`,
    };
  }

  function readout(state, metrics) {
    const M = metrics || cur.metrics;
    const T = M && M.totals ? M.totals : {};
    const served = T.served || {};
    const racks = T.racks || {};
    const rows = [
      { label: 'Earth facility power', value: fmt.mw(T.earthFacilityMW), unit: '', sourceId: 'd.facility' },
      { label: 'Earth grid cap', value: fmt.mw(T.gridCapMW), unit: '', sourceId: 's9.setting' },
      { label: 'Share of peak demand served', value: fmt.pct(served.overall), unit: '', sourceId: 'd.demand' },
      { label: 'Racks', value: fmt.num(racks.total), unit: 'racks', sourceId: 'd.capacity' },
      { label: 'Energy per output token', value: fmt.j(T.jPerOutputToken), unit: '', sourceId: 'd.jtoken' },
      { label: 'Off-world IT power', value: fmt.mw(T.offworldITMW), unit: '', sourceId: 'd.placement' },
    ];
    if (existing.length) {
      const big = existing.reduce((a, b) => (num(b.mw) > num(a.mw) ? b : a), existing[0]);
      rows.push({ label: 'Known AI campuses', value: fmt.num(existing.length), unit: `shown, largest ${shortName(big.name)} ${fmt.mw(big.mw)}`, sourceId: 'ext.existing' });
    }
    rows.push({ label: 'Cleanview US operating (with MW)', value: fmt.num(cvTotals.operatingCount), unit: 'data centers', sourceId: 'cv.map' });
    rows.push({ label: 'Cleanview US planned (with MW)', value: fmt.num(cvTotals.plannedCount), unit: 'data centers', sourceId: 'cv.map' });
    if (cvDrawn) rows.push({ label: 'Cleanview markers on the globe', value: fmt.num(cvDrawn), unit: '', sourceId: 'cv.map' });
    return rows;
  }

  function caption(state, metrics) {
    const M = metrics || cur.metrics;
    if (!M || !M.sites) return 'The Earth fleet is waiting for the model to run.';
    const T = M.totals || {};
    const n = earthList(M).filter((m) => m.enabled !== false).length;
    const served = T.served || {};
    if (n === 0) return `No Earth site is switched on, so the ${fmt.mw(T.gridCapMW)} grid sits unused and ${fmt.pct(served.overall)} of peak demand is served.`;
    const tail = num(T.offworldITMW) > 0 ? `, with ${fmt.mw(T.offworldITMW)} more in orbit` : '';
    return `${n} Earth ${n === 1 ? 'site shares' : 'sites share'} a ${fmt.mw(T.gridCapMW)} grid; they draw ${fmt.mw(T.earthFacilityMW)} and serve ${fmt.pct(served.overall)} of peak demand${tail}.`;
  }

  function pickables() {
    return SITE_IDS.map((sid) => (pins[sid] ? pins[sid].root : null)).filter(Boolean);
  }

  function dispose() {
    if (hasWin) {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('blur', onUp);
    }
    ocean.onBeforeRender = noop;
    kit.dispose(group);
  }

  if (cur.metrics) update(app ? app.state : null, cur.metrics, cur.lens);

  return { group, update, pickables, tick, legend, readout, caption, dispose };
}
