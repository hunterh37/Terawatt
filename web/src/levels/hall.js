// Hall level: one hall of the focused Earth site as a schematic tabletop hall (not to scale).
// Racks are one InstancedMesh (lens colour) with a second thin instanced layer for the pool tag.

import * as THREE from 'three';

export const id = 'hall';

const PER_ROW = 8, PAIRS = 4, PAIR_D = 0.12, HOT = 0.05, Z0 = -0.315;
const RK = { sx: 0.066, sy: 0.09, sz: 0.043, pitchX: 0.075, rowOff: 0.0375 };
const num = (v, d = 0) => (Number.isFinite(v) ? v : d);
const POOL_NAME = { prefill: 'Prefill', decode: 'Decode' };

function rackSpot(i) {
  const p = Math.floor(i / (PER_ROW * 2)), r = Math.floor((i % (PER_ROW * 2)) / PER_ROW), c = i % PER_ROW;
  const zc = Z0 + p * (PAIR_D + HOT) + PAIR_D / 2;
  return { x: (c - (PER_ROW - 1) / 2) * RK.pitchX, z: zc + (r === 0 ? -RK.rowOff : RK.rowOff), rotY: r === 0 ? 0 : Math.PI };
}
const pairZ = (p) => Z0 + p * (PAIR_D + HOT) + PAIR_D / 2;

function rackInfo(metrics, type) {
  const rt = metrics && metrics.racksForYear ? metrics.racksForYear[type] : null;
  if (!rt) return { kW: 0, chips: 0, costUSD: 0, kWPerChip: 0, label: 'rack', available: true };
  return { kW: num(rt.kW), chips: num(rt.chips), costUSD: num(rt.costUSD), label: rt.label || 'rack', available: rt.available !== false,
    kWPerChip: Number.isFinite(rt.kWPerChip) ? rt.kWPerChip : num(rt.kW) / Math.max(1, num(rt.chips, 1)) };
}

/** Everything the hall needs for one frame, or { ok: false, reason }. */
function model(state, metrics, catalog) {
  const focus = (state && state.view && state.view.focus) || {};
  const siteId = focus.site || 'wtx';
  const sm = metrics && metrics.sites ? metrics.sites[siteId] : null;
  const m = { ok: false, reason: '', siteId, sm };
  if (!sm) { m.reason = 'No numbers for this site yet.'; return m; }
  if (sm.kind !== 'earth') { m.reason = `${sm.name} is off-world, and orbit skips buildings and halls.\nGo up to the site and pick its rack.`; return m; }
  const pre = num(sm.racks && sm.racks.prefill), dec = num(sm.racks && sm.racks.decode), total = pre + dec;
  if (total <= 0) { m.reason = `${sm.name} holds no racks in this scenario, so there is no hall to show.`; return m; }
  const cap = Math.min(PAIRS * PER_ROW * 2, Math.max(1, num(catalog.facility.hallRacks, 64)));
  const halls = Math.max(1, num(sm.halls, Math.ceil(total / cap)));
  const idx = Math.min(halls - 1, Math.max(0, parseInt(focus.hall, 10) || 0));
  const start = idx * cap, n = Math.max(0, Math.min(cap, total - start));
  const preN = Math.max(0, Math.min(start + n, pre) - start), decN = n - preN;
  const pt = sm.rackType ? sm.rackType.prefill : 'gpu', dt = sm.rackType ? sm.rackType.decode : 'gpu';
  const pi = rackInfo(metrics, pt), di = rackInfo(metrics, dt);
  const itMW = (preN * pi.kW + decN * di.kW) / 1000, pue = num(sm.pue, 1);
  return Object.assign(m, { ok: true, cap, halls, idx, start, n, preN, decN, pt, dt, pi, di, itMW, pue, facMW: itMW * pue, cooling: sm.cooling });
}

function lensScale(lens, metrics, catalog) {
  const types = Object.values((metrics && metrics.racksForYear) || {});
  const mx = (f) => Math.max(0.001, ...types.map((t) => num(f(t))));
  const kwc = (t) => (Number.isFinite(t.kWPerChip) ? t.kWPerChip : num(t.kW) / Math.max(1, num(t.chips, 1)));
  if (lens === 'power') return { min: 0, max: mx((t) => t.kW), src: 's12.racks', title: 'Rack power', f: 'kw' };
  if (lens === 'cost') return { min: 0, max: mx((t) => t.costUSD), src: 's12.racks', title: 'Rack cost', f: 'usd' };
  if (lens === 'water') return { min: 0, max: Math.max(0.001, ...Object.values(catalog.cooling).map((c) => num(c.waterLPerKWh))), src: 's15.water', title: 'Cooling water per kWh', f: 'lkwh' };
  if (lens === 'sentiment') return { min: -2, max: 2, src: 'ext.sentiment', title: 'Local sentiment', f: 'sent' };
  return { min: 0, max: mx(kwc), src: 'd.kw_per_chip', title: 'Heat: kW per chip', f: 'kwc' };
}

function lensValue(lens, m, pool, catalog) {
  const info = pool === 'prefill' ? m.pi : m.di;
  if (lens === 'power') return info.kW;
  if (lens === 'cost') return info.costUSD;
  if (lens === 'water') { const c = catalog.cooling[m.cooling]; return c ? num(c.waterLPerKWh) : 0; }
  if (lens === 'sentiment') return m.sm.sentiment ? num(m.sm.sentiment.score) : 0;
  return info.kWPerChip;
}

export function create(ctx) {
  const { kit } = ctx;
  const { PALETTE, fmt } = kit;
  const catalog = (ctx.data && ctx.data.catalog) || (ctx.app && ctx.app.catalog);
  const group = new THREE.Group();
  const content = new THREE.Group();
  group.add(content);

  const cap = Math.min(PAIRS * PER_ROW * 2, Math.max(1, num(catalog.facility.hallRacks, 64)));
  let cm = { ok: false, reason: '' };
  let coolKey = '';
  let coolGroup = null;
  let msgText = null;

  // ---- static room ----
  const floor = kit.plate(0.92, 0.84, kit.sharedMaterial('#1a2230', { rough: 0.9 }), 0.004);
  content.add(floor);
  const wallMat = kit.ghostMaterial(PALETTE.ghost, 0.14);
  const back = kit.box(0.92, 0.12, 0.006, wallMat); back.position.set(0, 0, -0.42);
  const left = kit.box(0.006, 0.12, 0.84, wallMat); left.position.set(-0.46, 0, 0);
  content.add(back, left);
  for (let p = 0; p < PAIRS; p++) {
    const cold = kit.box(0.64, 0.0015, 0.03, kit.sharedMaterial('#1f4a66')); cold.position.set(0, 0.004, pairZ(p));
    content.add(cold);
    if (p < PAIRS - 1) {
      const hot = kit.box(0.64, 0.0015, HOT * 0.8, kit.sharedMaterial('#5a3022')); hot.position.set(0, 0.004, pairZ(p) + PAIR_D / 2 + HOT / 2);
      content.add(hot);
    }
  }
  const coldLbl = kit.label('cold aisle', { size: 0.011, color: PALETTE.decode });
  coldLbl.position.set(0.41, 0.02, pairZ(0));
  const hotLbl = kit.label('hot aisle', { size: 0.011, color: PALETTE.prefill });
  hotLbl.position.set(0.41, 0.02, pairZ(0) + PAIR_D / 2 + HOT / 2);
  content.add(coldLbl, hotLbl);

  // ---- busway with power flow ----
  const flows = [];
  for (let p = 0; p < PAIRS; p++) {
    const bar = kit.box(0.64, 0.006, 0.01, kit.sharedMaterial(PALETTE.power, { emissive: PALETTE.power, emissiveIntensity: 0.4 }));
    bar.position.set(0, 0.125, pairZ(p));
    content.add(bar);
    const curve = new THREE.LineCurve3(new THREE.Vector3(-0.32, 0.135, pairZ(p)), new THREE.Vector3(0.32, 0.135, pairZ(p)));
    const fp = kit.flowParticles(curve, { count: 14, color: PALETTE.power, size: 0.004, speed: 0.18 });
    content.add(fp.object); flows.push(fp);
  }
  const feeder = kit.box(0.01, 0.006, 0.66, kit.sharedMaterial(PALETTE.power, { emissive: PALETTE.power, emissiveIntensity: 0.4 }));
  feeder.position.set(0.34, 0.125, 0); content.add(feeder);

  // ---- racks: lens-coloured body plus a pool tag on top ----
  const bodyMat = kit.material('#ffffff', { metal: 0.3, rough: 0.5 });
  const rackMesh = kit.instancedBoxes(cap, bodyMat);
  const tagMesh = kit.instancedBoxes(cap, kit.material('#ffffff', { rough: 0.4 }));
  rackMesh.count = 0; tagMesh.count = 0;
  content.add(rackMesh, tagMesh);
  const pickFor = (i) => {
    if (!cm.ok) return null;
    const pool = i < cm.preN ? 'prefill' : 'decode';
    const info = pool === 'prefill' ? cm.pi : cm.di;
    return { level: 'rack', id: pool, label: `${POOL_NAME[pool]} rack, ${info.label}` };
  };
  rackMesh.userData.pickInstance = pickFor;
  tagMesh.userData.pickInstance = pickFor;

  // ---- labels ----
  const floorLbl = kit.label('Hall', { size: 0.02 });
  floorLbl.position.set(0, 0.025, 0.395);
  content.add(floorLbl);
  const noteLbl = kit.label('schematic, not to scale', { size: 0.011, color: PALETTE.dim });
  noteLbl.position.set(-0.33, 0.02, 0.395);
  content.add(noteLbl);
  const msgLbl = kit.label('', { size: 0.024, color: PALETTE.warn });
  msgLbl.position.set(0, 0.08, 0);
  msgLbl.visible = false;
  group.add(msgLbl);

  const setMsg = (t) => {
    if (t === msgText) return;
    msgText = t;
    if (t) msgLbl.userData.setText(t);
    msgLbl.visible = !!t;
  };
  const setFloorText = (t) => { if (floorLbl.userData.text !== t) { floorLbl.userData.text = t; floorLbl.userData.setText(t); } };

  // ---- cooling units along the left wall ----
  function buildCooling(type) {
    if (coolGroup) { content.remove(coolGroup); kit.dispose(coolGroup); coolGroup = null; }
    const g = new THREE.Group();
    const blue = kit.sharedMaterial(PALETTE.water, { rough: 0.4 }), grey = kit.sharedMaterial('#9aa4b8', { rough: 0.5 });
    const dark = kit.sharedMaterial('#2a3446', { rough: 0.7 });
    for (let k = 0; k < 6; k++) {
      const z = -0.3 + k * 0.12;
      let u;
      if (type === 'airChillers') {
        u = kit.box(0.06, 0.08, 0.09, grey);
        const fan = kit.cylinder(0.025, 0.025, 0.008, dark, 16); fan.position.y = 0.08; u.add(fan);
      } else if (type === 'airEvap') {
        u = kit.box(0.05, 0.11, 0.08, blue);
        const fan = kit.cylinder(0.026, 0.026, 0.008, dark, 16); fan.position.y = 0.11; u.add(fan);
      } else if (type === 'immersion') {
        u = kit.box(0.075, 0.045, 0.09, dark);
        const fluid = kit.box(0.065, 0.004, 0.08, blue); fluid.position.y = 0.046; u.add(fluid);
      } else {
        u = kit.box(0.05, 0.075, 0.08, blue);
        const pipe = kit.cylinder(0.005, 0.005, 0.05, grey, 8); pipe.rotation.z = Math.PI / 2; pipe.position.set(0.04, 0.04, 0); u.add(pipe);
      }
      u.position.set(-0.39, 0.004, z);
      g.add(u);
    }
    const c = catalog.cooling[type];
    const lbl = kit.label(c ? `Cooling: ${c.label}` : 'Cooling', { size: 0.013, color: PALETTE.water });
    lbl.position.set(-0.36, 0.16, 0);
    g.add(lbl);
    coolGroup = g; content.add(g);
  }

  function pickables() { return cm.ok && cm.n > 0 ? [rackMesh, tagMesh] : []; }

  function update(state, metrics, lens) {
    cm = model(state, metrics, catalog);
    setMsg(cm.ok ? '' : cm.reason);
    content.visible = cm.ok;
    if (!cm.ok) return;
    if (coolKey !== cm.cooling) { coolKey = cm.cooling; buildCooling(cm.cooling); }
    const sc = lensScale(lens, metrics, catalog);
    rackMesh.count = cm.n; tagMesh.count = cm.n;
    const pin = new THREE.Color();
    for (let i = 0; i < cm.n; i++) {
      const pool = i < cm.preN ? 'prefill' : 'decode';
      const t = kit.norm(lensValue(lens, cm, pool, catalog), sc.min, sc.max);
      const s = rackSpot(i);
      kit.setInstance(rackMesh, i, { x: s.x, y: 0.004, z: s.z, sx: RK.sx, sy: RK.sy, sz: RK.sz, rotY: s.rotY, color: kit.ramp(lens, t) });
      pin.set(pool === 'prefill' ? PALETTE.prefill : PALETTE.decode);
      kit.setInstance(tagMesh, i, { x: s.x, y: 0.004 + RK.sy, z: s.z, sx: RK.sx, sy: 0.006, sz: RK.sz, rotY: s.rotY, color: pin });
    }
    rackMesh.visible = tagMesh.visible = cm.n > 0;
    if (cm.n > 0) { kit.instancesDone(rackMesh); kit.instancesDone(tagMesh); }
    setFloorText(`Hall ${cm.idx + 1} of ${cm.halls}, ${cm.n} racks, ${fmt.mw(cm.facMW)}, PUE ${cm.pue.toFixed(2)}`);
    for (const f of flows) f.setRate(cm.itMW > 0 ? 1 : 0);
  }

  function tick(dt) {
    if (!cm.ok) return;
    const d = Number.isFinite(dt) ? dt : 0;
    for (const f of flows) f.tick(d);
  }

  function legend(lens, state, metrics) {
    const sc = lensScale(lens, metrics, catalog);
    let items;
    if (sc.f === 'sent') {
      items = [[-2, 'Opposed'], [0, 'Mixed'], [2, 'Supportive']].map(([v, l]) => ({ color: kit.rampHex('sentiment', kit.norm(v, -2, 2)), label: l }));
    } else {
      const ff = { kw: fmt.kw, usd: fmt.usd, lkwh: (v) => `${v.toFixed(1)} L/kWh`, kwc: (v) => `${v.toFixed(1)} kW/chip` }[sc.f];
      items = kit.legendSteps(lens, sc.min, sc.max, ff, 5);
    }
    items.push({ color: PALETTE.prefill, label: 'Prefill rack top' }, { color: PALETTE.decode, label: 'Decode rack top' });
    return { title: sc.title, items, note: `Source ${sc.src}. Rack heights are schematic, not to scale.` };
  }

  function readout(state, metrics) {
    const m = model(state, metrics, catalog);
    if (!m.ok) return [];
    const rows = [
      { label: 'Hall', value: `${m.idx + 1} of ${m.halls}`, unit: '', sourceId: 'a.hall_racks' },
      { label: 'Racks in this hall', value: fmt.num(m.n), unit: `of ${fmt.num(m.cap)}`, sourceId: 'a.hall_racks' },
      { label: 'Prefill racks', value: fmt.num(m.preN), unit: m.pi.label, sourceId: 's12.racks' },
      { label: 'Decode racks', value: fmt.num(m.decN), unit: m.di.label, sourceId: 's12.racks' },
      { label: 'Hall IT power', value: fmt.mw(m.itMW), unit: '', sourceId: 's12.racks' },
      { label: 'Hall facility power', value: fmt.mw(m.facMW), unit: '', sourceId: 'd.facility' },
      { label: 'PUE', value: m.pue.toFixed(2), unit: '', sourceId: 's15.pue' },
    ];
    const c = catalog.cooling[m.cooling];
    if (c) rows.push({ label: 'Cooling', value: c.label, unit: '', sourceId: 's15.pue' });
    rows.push({ label: 'Rack power', value: fmt.kw(m.pi.kW), unit: m.pt === m.dt ? '' : 'prefill', sourceId: 's12.racks' });
    if (m.pt !== m.dt) rows.push({ label: 'Rack power', value: fmt.kw(m.di.kW), unit: 'decode', sourceId: 's12.racks' });
    return rows;
  }

  function caption(state, metrics) {
    const m = model(state, metrics, catalog);
    if (!m.ok) return m.reason.replace(/\n/g, ' ');
    const c = catalog.cooling[m.cooling];
    return `Hall ${m.idx + 1} of ${m.halls} holds ${m.n} racks drawing ${fmt.mw(m.itMW)} of IT power; ${c ? c.label.toLowerCase() : 'its cooling'} puts it at PUE ${m.pue.toFixed(2)}.`;
  }

  function dispose() { kit.dispose(group); }

  return { group, update, pickables, tick, legend, readout, caption, dispose };
}
