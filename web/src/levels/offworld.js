// Off-world level (Module 1, Business).
// Earth is small at one side, a low Earth orbit ring hugs it, and the Moon and Mars sit further out at
// log-scaled distances. A light pulse runs out and back along each link; its travel time is a log map of
// the round trip, so Mars is visibly slow. Schematic: distances and sizes are not to scale.

import { SITE_IDS } from '../contract.js';

export const id = 'offworld';

const EX = -0.36;
const EY = 0.22;
const ER = 0.075;
const LEO_R = 0.125;
const noop = () => {};

const num = (x, d = 0) => (Number.isFinite(x) ? x : d);

/** Points, lines and sprites must never catch pick rays (Points and Line use a huge default threshold). */
function inert(root) {
  root.traverse((o) => { if (o.isPoints || o.isLine || o.isSprite) o.raycast = noop; });
}

/** What each lens means for the four places: a value per place (null = not applicable), a scale, text. */
function bodySpec(lens, metrics, kit) {
  const fmt = kit.fmt;
  const S = metrics && metrics.sites ? metrics.sites : {};
  const T = metrics && metrics.totals ? metrics.totals : {};
  const offVals = (fn) => ({
    earth: null,
    leo: S.leo ? num(fn(S.leo)) : null,
    moon: S.moon ? num(fn(S.moon)) : null,
    mars: S.mars ? num(fn(S.mars)) : null,
  });
  const hiOf = (v) => Math.max(0, ...['earth', 'leo', 'moon', 'mars'].map((k) => (v[k] == null ? 0 : v[k])));
  if (lens === 'power') {
    const vals = offVals((m) => m.itMW);
    vals.earth = num(T.earthITMW);
    return { title: 'Power: IT MW by place', vals, lo: 0, hi: hiOf(vals), fmtV: (v) => fmt.mw(v),
      note: 'Ring colour is IT power by place. Source d.facility.' };
  }
  if (lens === 'cost') {
    const vals = offVals((m) => m.launchMult);
    return { title: 'Cost: launch cost multiplier', vals, lo: 0, hi: hiOf(vals), fmtV: (v) => `${fmt.num(v)}x`,
      note: 'Ring colour is the launch cost multiplier relative to low Earth orbit. Earth needs no launch, so its ring stays grey. Source s15.orbit.' };
  }
  if (lens === 'sentiment') {
    const vals = offVals((m) => (m.sentiment && Number.isFinite(m.sentiment.score) ? m.sentiment.score : 0));
    const en = SITE_IDS.map((k) => S[k]).filter((m) => m && m.enabled !== false && m.sentiment && Number.isFinite(m.sentiment.score));
    vals.earth = en.length ? en.reduce((a, m) => a + m.sentiment.score, 0) / en.length : null;
    return { title: 'Sentiment: news stance', vals, lo: -2, hi: 2, fmtV: () => '',
      note: 'Ring colour is the stance of one recent news article per site, averaged for Earth. A sample, not a poll. Source ext.sentiment.' };
  }
  if (lens === 'water') {
    const vals = offVals(() => 0);
    vals.earth = num(T.waterMLPerYear);
    return { title: 'Water: megalitres (ML) per year', vals, lo: 0, hi: hiOf(vals), fmtV: (v) => fmt.ml(v),
      note: 'Ring colour is cooling water use per year. Off-world sites use none. Source d.water.' };
  }
  const vals = offVals((m) => m.radiatorM2);
  return { title: 'Heat: radiator area', vals, lo: 0, hi: hiOf(vals), fmtV: (v) => `${fmt.short(v)} m2`,
    note: 'Ring colour is the radiator area needed to shed the heat. Earth sheds heat through cooling plants, so its ring stays grey. Source d.radiator.' };
}

function specItems(lens, spec, kit) {
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
  const fmt = kit.fmt;
  const PAL = kit.PALETTE;
  const landDots = Array.isArray(data.landDots) ? data.landDots : [];

  const GREY = new THREE.Color('#4a5468');
  const group = new THREE.Group();
  group.name = 'offworld';
  const cur = {
    metrics: app && app.metrics ? app.metrics : null,
    lens: (app && app.state && app.state.view && app.state.view.lens) || 'heat',
  };

  const makeLabel = (text, opts) => {
    const l = kit.label(text, opts);
    l.userData.lastText = text;
    l.raycast = noop;
    return l;
  };
  const putText = (l, text) => {
    if (l.userData.lastText !== text) { l.userData.setText(text); l.userData.lastText = text; }
  };
  const hitMat = () => new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  const setPick = (objs, pick) => { for (const o of objs) o.userData.pick = pick; };
  const mkHalo = (r) => {
    const mat = new THREE.MeshBasicMaterial({ color: '#4a5468', transparent: true, opacity: 0.9 });
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(r, 0.0025, 6, 56), mat);
    mesh.rotation.x = Math.PI / 2 - 0.3;
    mesh.raycast = noop;
    return mesh;
  };

  // Distances on a log scale of the round trip (schematic).
  const rttOf = (bid, fallback) => {
    const c = catalog.sites && catalog.sites[bid];
    if (c && Number.isFinite(c.rttMs)) return c.rttMs;
    const m = cur.metrics && cur.metrics.sites ? cur.metrics.sites[bid] : null;
    return m && Number.isFinite(m.rttMs) ? m.rttMs : fallback;
  };
  const rttLeo = rttOf('leo', 40);
  const rttMoon = rttOf('moon', 2600);
  const rttMars = rttOf('mars', 1500000);
  const xFor = (rtt) => EX + 0.2 + 0.56 * kit.norm(rtt, rttLeo, rttMars, { log: true });
  const periodFor = (rtt) => 0.9 + 11 * kit.norm(rtt, rttLeo, rttMars, { log: true });

  // ---------- Earth ----------
  const earth = new THREE.Group();
  earth.position.set(EX, EY, 0);
  {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(ER, 40, 28), kit.material('#10243f', { rough: 0.9, metal: 0 }));
    earth.add(ball);
    const pos = [];
    const tmp = new THREE.Vector3();
    landDots.forEach((d, i) => {
      if (i % 4 !== 0 || !d || !Number.isFinite(d[0]) || !Number.isFinite(d[1])) return;
      kit.latLonToVec3(d[0], d[1], ER * 1.01, tmp);
      pos.push([tmp.x, tmp.y, tmp.z]);
    });
    if (pos.length) earth.add(kit.dots(pos, { size: 1.6, color: PAL.land }));
    const hit = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), hitMat());
    earth.add(hit);
    setPick([earth, ball, hit], { level: 'fleet', id: '', label: 'Earth fleet' });
  }
  const earthHalo = mkHalo(ER * 1.22);
  earth.add(earthHalo);
  group.add(earth);

  // ---------- Low Earth orbit ring with a few orbiting dots ----------
  const leoPivot = new THREE.Group();
  leoPivot.position.copy(earth.position);
  leoPivot.rotation.set(1.2, 0, 0.35);
  const leoMat = new THREE.MeshBasicMaterial({ color: PAL.leo, transparent: true, opacity: 1 });
  const leoRing = new THREE.Mesh(new THREE.TorusGeometry(LEO_R, 0.003, 6, 72), leoMat);
  const leoHit = new THREE.Mesh(new THREE.TorusGeometry(LEO_R, 0.016, 6, 40), hitMat());
  const leoSpin = new THREE.Group();
  const satMat = kit.material(PAL.leo, { emissive: PAL.leo, emissiveIntensity: 0.6 });
  const sats = new THREE.InstancedMesh(new THREE.SphereGeometry(0.006, 8, 6), satMat, 8);
  {
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      sats.setMatrixAt(i, m4.makeTranslation(LEO_R * Math.cos(a), LEO_R * Math.sin(a), 0));
    }
    sats.instanceMatrix.needsUpdate = true;
    sats.computeBoundingSphere();
    sats.raycast = noop;
  }
  leoSpin.add(sats);
  leoPivot.add(leoRing, leoHit, leoSpin);
  setPick([leoPivot, leoRing, leoHit], { level: 'site', id: 'leo', label: 'Low Earth orbit' });
  group.add(leoPivot);

  // ---------- Moon and Mars ----------
  function makeBody(bid, name, radius, color, pos) {
    const g = new THREE.Group();
    g.position.copy(pos);
    const mat = kit.material(color, { rough: 0.9, metal: 0 });
    const ball = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 22), mat);
    const hit = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.8, 12, 8), hitMat());
    const halo = mkHalo(radius * 1.5);
    g.add(ball, hit, halo);
    setPick([g, ball, hit], { level: 'site', id: bid, label: name });
    return { group: g, mat, halo, radius, enabled: null };
  }
  const moonName = (catalog.sites && catalog.sites.moon && catalog.sites.moon.name) || 'Moon';
  const marsName = (catalog.sites && catalog.sites.mars && catalog.sites.mars.name) || 'Mars';
  const moon = makeBody('moon', moonName, 0.035, PAL.moon, new THREE.Vector3(xFor(rttMoon), EY + 0.04, -0.07));
  const mars = makeBody('mars', marsName, 0.05, PAL.mars, new THREE.Vector3(xFor(rttMars), EY - 0.02, 0.06));
  group.add(moon.group, mars.group);
  const bodies = { moon, mars };

  // ---------- links with out-and-back light pulses ----------
  const links = [];
  function makeLink(bid, toPos, endGap, rtt) {
    const dir = toPos.clone().sub(earth.position).normalize();
    const a = earth.position.clone().addScaledVector(dir, ER + 0.012);
    const b = toPos.clone().addScaledVector(dir, -endGap);
    const mid = a.clone().lerp(b, 0.5);
    mid.y += 0.04;
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    const line = kit.line(curve.getPoints(40), { color: PAL.dim, opacity: 0.55 });
    const pulse = new THREE.Mesh(new THREE.SphereGeometry(0.0065, 10, 8), kit.material(PAL.accent, { emissive: PAL.accent, emissiveIntensity: 1.4 }));
    pulse.raycast = noop;
    group.add(line, pulse);
    links.push({ bid, curve, pulse, period: periodFor(rtt) });
  }
  {
    const ringPoint = new THREE.Vector3(LEO_R * Math.cos(0.9), LEO_R * Math.sin(0.9), 0).applyEuler(leoPivot.rotation);
    makeLink('leo', earth.position.clone().add(ringPoint), 0, rttLeo);
    makeLink('moon', moon.group.position.clone(), moon.radius + 0.02, rttMoon);
    makeLink('mars', mars.group.position.clone(), mars.radius + 0.02, rttMars);
  }

  // Depth cues: a faint axis on the table and a drop line under each body.
  group.add(kit.line([[-0.45, 0.004, 0], [0.45, 0.004, 0]], { color: PAL.dim, opacity: 0.3 }));
  for (const g of [earth, moon.group, mars.group]) {
    group.add(kit.line([[g.position.x, 0.004, g.position.z], [g.position.x, g.position.y, g.position.z]], { color: PAL.dim, opacity: 0.25 }));
  }

  // ---------- labels ----------
  const earthLabel = makeLabel('Earth', { size: 0.0125 });
  earthLabel.position.set(EX, EY + ER + 0.075, 0);
  const leoLabel = makeLabel('Low Earth orbit', { size: 0.0125 });
  leoLabel.position.set(EX, EY - ER - 0.07, 0);
  const moonLabel = makeLabel(moonName, { size: 0.0125 });
  moonLabel.position.set(moon.group.position.x, moon.group.position.y + moon.radius + 0.075, moon.group.position.z);
  const marsLabel = makeLabel(marsName, { size: 0.0125 });
  marsLabel.position.set(mars.group.position.x, mars.group.position.y + mars.radius + 0.075, mars.group.position.z);
  const axisNote = makeLabel('Distance is a log scale of round trip time\nSchematic, not to scale', { size: 0.0105, color: PAL.dim, bg: null });
  axisNote.position.set(0, 0.02, 0.43);
  group.add(earthLabel, leoLabel, moonLabel, marsLabel, axisNote);

  inert(group);

  // ---------- update: restyle only ----------
  function update(state, metrics, lens) {
    if (metrics) cur.metrics = metrics;
    if (lens) cur.lens = lens;
    else if (state && state.view && state.view.lens) cur.lens = state.view.lens;
    const M = cur.metrics;
    if (!M || !M.sites) return;
    const S = M.sites;
    const T = M.totals || {};
    const spec = bodySpec(cur.lens, M, kit);
    const tone = (bid) => {
      const v = spec.vals[bid];
      return v == null ? GREY : kit.ramp(cur.lens, kit.norm(v, spec.lo, spec.hi));
    };

    earthHalo.material.color.copy(tone('earth'));
    putText(earthLabel, `Earth\n${fmt.mw(T.earthFacilityMW)} of ${fmt.mw(T.gridCapMW)} grid`);

    const leo = S.leo;
    const leoOn = !!(leo && leo.enabled);
    leoMat.color.copy(tone('leo'));
    leoMat.opacity = leoOn ? 1 : 0.5;
    satMat.emissiveIntensity = leoOn ? 0.9 : 0.1;
    if (leo) {
      putText(leoLabel, `${leo.name || 'Low Earth orbit'}\n${fmt.ms(leo.rttMs)} round trip, launch ${fmt.num(leo.launchMult)}x\n${leoOn ? `on, ${fmt.mw(leo.itMW)} IT` : 'off'}`);
    }

    for (const bid of ['moon', 'mars']) {
      const b = bodies[bid];
      const m = S[bid];
      if (!m) continue;
      const on = !!m.enabled;
      if (b.enabled !== on) {
        b.enabled = on;
        b.mat.transparent = !on;
        b.mat.opacity = on ? 1 : 0.5;
        b.mat.needsUpdate = true;
      }
      b.halo.material.color.copy(tone(bid));
      b.halo.material.opacity = on ? 1 : 0.5;
      putText(bid === 'moon' ? moonLabel : marsLabel,
        `${m.name || bid}\n${fmt.ms(m.rttMs)} round trip, launch ${fmt.num(m.launchMult)}x\n${on ? `on, ${fmt.mw(m.itMW)} IT` : 'off'}`);
    }
    for (const l of links) {
      const m = S[l.bid];
      l.pulse.scale.setScalar(m && m.enabled ? 1 : 0.55);
    }
  }

  let clock = 0;
  const tmpV = new THREE.Vector3();
  function tick(dt) {
    const d = Math.min(0.1, num(dt));
    clock += d;
    for (const l of links) {
      const u = (clock / l.period) % 1;
      const tri = u < 0.5 ? u * 2 : 2 - u * 2;
      l.curve.getPoint(tri, tmpV);
      l.pulse.position.copy(tmpV);
    }
    earth.rotation.y += d * 0.1;
    leoSpin.rotation.z += d * 0.5;
    moon.group.rotation.y += d * 0.05;
    mars.group.rotation.y += d * 0.07;
  }

  function pickables() {
    return [earth, leoPivot, moon.group, mars.group];
  }

  function legend(lens, state, metrics) {
    const L = lens || cur.lens;
    const spec = bodySpec(L, metrics || cur.metrics, kit);
    return {
      title: spec.title,
      items: specItems(L, spec, kit),
      note: `${spec.note} Distance is a log scale of round trip time, schematic, not to scale. Each pulse runs out and back at a speed set by that round trip. Launch multiplier means launch cost relative to low Earth orbit.`,
    };
  }

  function readout(state, metrics) {
    const M = metrics || cur.metrics;
    const T = M && M.totals ? M.totals : {};
    const S = M && M.sites ? M.sites : {};
    const rows = [
      { label: 'Earth facility power', value: fmt.mw(T.earthFacilityMW), unit: '', sourceId: 'd.facility' },
      { label: 'Earth grid cap', value: fmt.mw(T.gridCapMW), unit: '', sourceId: 's9.setting' },
      { label: 'Off-world IT power', value: fmt.mw(T.offworldITMW), unit: '', sourceId: 'd.placement' },
    ];
    for (const bid of ['leo', 'moon', 'mars']) {
      const m = S[bid];
      if (!m) continue;
      rows.push({ label: `${m.name || bid} round trip`, value: fmt.ms(m.rttMs), unit: '', sourceId: 's13.rtt' });
      rows.push({ label: `${m.name || bid} IT power`, value: m.enabled ? fmt.mw(m.itMW) : 'off', unit: '', sourceId: 'd.facility' });
    }
    const chat = catalog.workloads && catalog.workloads.chat ? catalog.workloads.chat : null;
    if (chat && Number.isFinite(chat.ttftS)) {
      rows.push({ label: 'Chat time-to-first-token budget', value: fmt.ms(chat.ttftS * 1000), unit: '', sourceId: 's13.slo' });
    }
    return rows;
  }

  function caption(state, metrics) {
    const M = metrics || cur.metrics;
    if (!M || !M.sites || !M.sites.moon || !M.sites.leo) return 'The off-world view is waiting for the model to run.';
    const leo = M.sites.leo;
    const moonM = M.sites.moon;
    const chat = catalog.workloads && catalog.workloads.chat ? catalog.workloads.chat : null;
    const tooSlow = chat && Number.isFinite(chat.ttftS) && num(moonM.rttMs) > chat.ttftS * 1000;
    if (!leo.enabled) {
      return tooSlow
        ? `Orbit is switched off here; a ${fmt.ms(moonM.rttMs)} round trip would rule the Moon out for chat.`
        : `Orbit is switched off here; the Moon is ${fmt.ms(moonM.rttMs)} away.`;
    }
    return tooSlow
      ? `Orbit adds ${fmt.mw(leo.itMW)} of compute but a ${fmt.ms(moonM.rttMs)} round trip rules the Moon out for chat.`
      : `Orbit adds ${fmt.mw(leo.itMW)} of compute and the Moon is ${fmt.ms(moonM.rttMs)} away.`;
  }

  function dispose() {
    kit.dispose(group);
  }

  if (cur.metrics) update(app ? app.state : null, cur.metrics, cur.lens);

  return { group, update, pickables, tick, legend, readout, caption, dispose };
}
