// Building level: the halls of the focused Earth site as blocks in a grid under a cutaway roof,
// with the substation and cooling plant outside. Schematic, not to scale.

import * as THREE from 'three';

export const id = 'building';

const W = 0.58, D = 0.46, MAX_LABELS = 12;
const num = (v, d = 0) => (Number.isFinite(v) ? v : d);

function rackKW(metrics, type) {
  const rt = metrics && metrics.racksForYear ? metrics.racksForYear[type] : null;
  return rt ? { kW: num(rt.kW), chips: num(rt.chips), usd: num(rt.costUSD) } : { kW: 0, chips: 0, usd: 0 };
}

/** Site numbers plus per-hall stats (halls fill in order: prefill racks first, last hall partial). */
function model(state, metrics, catalog) {
  const focus = (state && state.view && state.view.focus) || {};
  const siteId = focus.site || 'wtx';
  const sm = metrics && metrics.sites ? metrics.sites[siteId] : null;
  const m = { ok: false, reason: '', siteId, sm };
  if (!sm) { m.reason = 'No numbers for this site yet.'; return m; }
  if (sm.kind !== 'earth') { m.reason = `${sm.name} is off-world, and orbit skips buildings.\nGo up to the site and pick its rack.`; return m; }
  const pre = num(sm.racks && sm.racks.prefill), dec = num(sm.racks && sm.racks.decode), total = pre + dec;
  if (total <= 0) { m.reason = `${sm.name} holds no racks in this scenario, so there is no building to show.`; return m; }
  const cap = Math.min(64, Math.max(1, num(catalog.facility.hallRacks, 64)));
  const halls = Math.max(1, num(sm.halls, Math.ceil(total / cap)));
  const pt = sm.rackType ? sm.rackType.prefill : 'gpu', dt = sm.rackType ? sm.rackType.decode : 'gpu';
  const pi = rackKW(metrics, pt), di = rackKW(metrics, dt), pue = num(sm.pue, 1);
  const list = [];
  for (let h = 0; h < halls; h++) {
    const start = h * cap, n = Math.max(0, Math.min(cap, total - start));
    const preN = Math.max(0, Math.min(start + n, pre) - start), decN = n - preN;
    const itMW = (preN * pi.kW + decN * di.kW) / 1000, chips = preN * pi.chips + decN * di.chips;
    list.push({ n, preN, decN, itMW, facMW: itMW * pue, rackUSD: preN * pi.usd + decN * di.usd, kWPerChip: chips > 0 ? (itMW * 1000) / chips : 0 });
  }
  return Object.assign(m, { ok: true, cap, halls, total, pue, list, cooling: sm.cooling });
}

function lensScale(lens, m, metrics, catalog) {
  const types = Object.values((metrics && metrics.racksForYear) || {});
  const maxOf = (f) => Math.max(0.001, ...m.list.map(f));
  if (lens === 'power') return { min: 0, max: maxOf((h) => h.facMW), src: 'd.facility', title: 'Hall facility power', f: 'mw' };
  if (lens === 'cost') return { min: 0, max: maxOf((h) => h.rackUSD), src: 's12.racks', title: 'Hall rack cost', f: 'usd' };
  if (lens === 'water') return { min: 0, max: Math.max(0.001, ...Object.values(catalog.cooling).map((c) => num(c.waterLPerKWh))), src: 's15.water', title: 'Cooling water per kWh', f: 'lkwh' };
  if (lens === 'sentiment') return { min: -2, max: 2, src: 'ext.sentiment', title: 'Local sentiment', f: 'sent' };
  const kwc = types.map((t) => (Number.isFinite(t.kWPerChip) ? t.kWPerChip : num(t.kW) / Math.max(1, num(t.chips, 1))));
  return { min: 0, max: Math.max(0.001, ...kwc), src: 'd.kw_per_chip', title: 'Heat: kW per chip', f: 'kwc' };
}

function lensValue(lens, m, h, catalog) {
  if (lens === 'power') return h.facMW;
  if (lens === 'cost') return h.rackUSD;
  if (lens === 'water') { const c = catalog.cooling[m.cooling]; return c ? num(c.waterLPerKWh) : 0; }
  if (lens === 'sentiment') return m.sm.sentiment ? num(m.sm.sentiment.score) : 0;
  return h.kWPerChip;
}

export function create(ctx) {
  const { kit } = ctx;
  const { PALETTE, fmt } = kit;
  const catalog = (ctx.data && ctx.data.catalog) || (ctx.app && ctx.app.catalog);
  const group = new THREE.Group();
  const content = new THREE.Group();
  const blocks = new THREE.Group();
  group.add(content);
  content.add(blocks);

  let cm = { ok: false, reason: '' };
  let built = -1, mesh = null, layout = null, hallLbls = [];
  let coolKey = '', coolGroup = null, msgText = null;
  const flows = [];

  // ---- static site: terrain, envelope, cutaway roof ----
  content.add(kit.plate(0.96, 0.9, kit.sharedMaterial('#1a2230', { rough: 0.9 }), 0.004));
  const ghost = kit.ghostMaterial(PALETTE.ghost, 0.08);
  const env = kit.box(W + 0.04, 0.1, D + 0.04, ghost); env.position.y = 0.004;
  const roof = kit.box(W + 0.04, 0.004, (D + 0.04) / 2, kit.ghostMaterial(PALETTE.ghost, 0.22));
  roof.position.set(0, 0.104, -(D + 0.04) / 4);
  content.add(env, roof);

  // ---- substation with a grid line into the building ----
  const grey = kit.sharedMaterial('#9aa4b8', { rough: 0.5 }), dark = kit.sharedMaterial('#2a3446', { rough: 0.7 });
  const sub = kit.box(0.1, 0.03, 0.11, dark); sub.position.set(0.42, 0.004, -0.18);
  for (let k = 0; k < 3; k++) { const tr = kit.cylinder(0.014, 0.014, 0.05, grey, 12); tr.position.set(-0.03 + k * 0.03, 0.03, 0); sub.add(tr); }
  content.add(sub);
  const gridPts = [[0.37, 0.03, -0.18], [0.34, 0.03, -0.18], [0.31, 0.03, -0.18]];
  const gridTube = kit.tube(gridPts, 0.003, kit.sharedMaterial(PALETTE.power, { emissive: PALETTE.power, emissiveIntensity: 0.4 }), 8);
  content.add(gridTube);
  const gridFlow = kit.flowParticles(gridTube.userData.curve, { count: 8, color: PALETTE.power, size: 0.004, speed: 0.4 });
  content.add(gridFlow.object); flows.push(gridFlow);
  const subLbl = kit.label('Substation', { size: 0.012, color: PALETTE.power });
  subLbl.position.set(0.42, 0.1, -0.18);
  content.add(subLbl);

  // ---- cooling plant, rebuilt when the cooling type changes ----
  function buildPlant(type) {
    if (coolGroup) { content.remove(coolGroup); kit.dispose(coolGroup); coolGroup = null; }
    flows.length = 1;
    const g = new THREE.Group();
    const blue = kit.sharedMaterial(PALETTE.water, { rough: 0.4 });
    const evap = type === 'airEvap';
    const pad = kit.box(0.1, 0.012, 0.2, dark); pad.position.set(-0.42, 0.004, 0.1); g.add(pad);
    for (let k = 0; k < 3; k++) {
      const z = 0.03 + k * 0.07;
      const u = evap ? kit.box(0.045, 0.07, 0.05, blue) : kit.box(0.06, 0.04, 0.05, grey);
      u.position.set(-0.42, 0.016, z);
      const fan = kit.cylinder(0.02, 0.02, 0.008, dark, 16); fan.position.y = evap ? 0.07 : 0.04; u.add(fan);
      g.add(u);
    }
    if (evap) {
      const tank = kit.cylinder(0.025, 0.025, 0.05, blue, 20); tank.position.set(-0.44, 0.016, 0.2); g.add(tank);
    }
    const pipePts = [[-0.37, 0.03, 0.1], [-0.34, 0.03, 0.1], [-0.31, 0.03, 0.1]];
    const pipe = kit.tube(pipePts, 0.003, kit.sharedMaterial(PALETTE.water, { emissive: PALETTE.water, emissiveIntensity: 0.4 }), 8);
    g.add(pipe);
    const fp = kit.flowParticles(pipe.userData.curve, { count: 8, color: PALETTE.water, size: 0.004, speed: 0.3 });
    g.add(fp.object); flows.push(fp);
    const c = catalog.cooling[type];
    const lbl = kit.label(c ? `Cooling plant: ${c.label}` : 'Cooling plant', { size: 0.012, color: PALETTE.water });
    lbl.position.set(-0.42, 0.13, 0.1); g.add(lbl);
    coolGroup = g; content.add(g);
  }

  // ---- hall blocks (one InstancedMesh; rebuilt only when the hall count changes) ----
  const pickFor = (i) => (cm.ok && i < cm.halls ? { level: 'hall', id: String(i), label: `Hall ${i + 1}` } : null);
  function ensureBlocks(halls) {
    if (halls === built) return;
    built = halls;
    if (mesh) { blocks.remove(mesh); kit.dispose(mesh); mesh = null; }
    for (const l of hallLbls) { blocks.remove(l); kit.dispose(l); }
    hallLbls = [];
    layout = kit.gridLayout(halls, W - 0.04, D - 0.04, { gap: 0.2 });
    mesh = kit.instancedBoxes(halls, kit.material('#ffffff', { metal: 0.2, rough: 0.5 }));
    mesh.userData.pickInstance = pickFor;
    blocks.add(mesh);
    if (halls <= MAX_LABELS) {
      for (let i = 0; i < halls; i++) { const l = kit.label('Hall', { size: 0.011 }); blocks.add(l); hallLbls.push(l); }
    }
  }

  const floorLbl = kit.label('Building', { size: 0.018 });
  floorLbl.position.set(0, 0.025, 0.4);
  const noteLbl = kit.label('schematic, not to scale', { size: 0.011, color: PALETTE.dim });
  noteLbl.position.set(-0.33, 0.02, 0.4);
  content.add(floorLbl, noteLbl);
  const msgLbl = kit.label('', { size: 0.024, color: PALETTE.warn });
  msgLbl.position.set(0, 0.08, 0);
  msgLbl.visible = false;
  group.add(msgLbl);

  const setText = (spr, t) => { if (spr.userData.text !== t) { spr.userData.text = t; spr.userData.setText(t); } };
  const setMsg = (t) => { if (t === msgText) return; msgText = t; if (t) msgLbl.userData.setText(t); msgLbl.visible = !!t; };

  function pickables() { return cm.ok && mesh ? [mesh] : []; }

  function update(state, metrics, lens) {
    cm = model(state, metrics, catalog);
    setMsg(cm.ok ? '' : cm.reason);
    content.visible = cm.ok;
    if (!cm.ok) return;
    if (coolKey !== cm.cooling) { coolKey = cm.cooling; buildPlant(cm.cooling); }
    ensureBlocks(cm.halls);
    const sc = lensScale(lens, cm, metrics, catalog);
    for (let i = 0; i < cm.halls; i++) {
      const h = cm.list[i], p = layout.positions[i];
      const height = 0.03 + 0.05 * (h.n / cm.cap);
      const t = kit.norm(lensValue(lens, cm, h, catalog), sc.min, sc.max);
      kit.setInstance(mesh, i, { x: p.x, y: 0.004, z: p.z, sx: Math.max(0.004, p.w), sy: height, sz: Math.max(0.004, p.d), color: kit.ramp(lens, t) });
      if (hallLbls[i]) {
        hallLbls[i].position.set(p.x, 0.004 + height + 0.02, p.z);
        setText(hallLbls[i], `Hall ${i + 1}\n${fmt.mw(h.facMW)}`);
      }
    }
    kit.instancesDone(mesh);
    const s = cm.sm;
    setText(floorLbl, `${s.name}: ${cm.halls} halls, ${fmt.num(cm.total)} racks, ${fmt.mw(s.facilityMW)}, PUE ${cm.pue.toFixed(2)}`);
    setText(subLbl, `Substation\n${fmt.mw(s.allocMW)} grid`);
    for (const f of flows) f.setRate(num(s.itMW) > 0 ? 1 : 0);
  }

  function tick(dt) {
    if (!cm.ok) return;
    const d = Number.isFinite(dt) ? dt : 0;
    for (const f of flows) f.tick(d);
  }

  function legend(lens, state, metrics) {
    const m = model(state, metrics, catalog);
    if (!m.ok) return { title: 'Building', items: [], note: 'n/a: orbit has no building' };
    const sc = lensScale(lens, m, metrics, catalog);
    let items;
    if (sc.f === 'sent') {
      items = [[-2, 'Opposed'], [0, 'Mixed'], [2, 'Supportive']].map(([v, l]) => ({ color: kit.rampHex('sentiment', kit.norm(v, -2, 2)), label: l }));
    } else {
      const ff = { mw: fmt.mw, usd: fmt.usd, lkwh: (v) => `${v.toFixed(1)} L/kWh`, kwc: (v) => `${v.toFixed(1)} kW/chip` }[sc.f];
      items = kit.legendSteps(lens, sc.min, sc.max, ff, 5);
    }
    return { title: sc.title, items, note: `Source ${sc.src}. Block height shows how full each hall is. Schematic, not to scale.` };
  }

  function readout(state, metrics) {
    const m = model(state, metrics, catalog);
    if (!m.ok) return [];
    const s = m.sm, c = catalog.cooling[m.cooling];
    const rows = [
      { label: 'Halls', value: fmt.num(m.halls), unit: '', sourceId: 'a.hall_racks' },
      { label: 'Racks per hall (cap)', value: fmt.num(m.cap), unit: '', sourceId: 'a.hall_racks' },
      { label: 'Racks in building', value: fmt.num(m.total), unit: '', sourceId: 's12.racks' },
      { label: 'IT power', value: fmt.mw(s.itMW), unit: '', sourceId: 's12.racks' },
      { label: 'Facility power', value: fmt.mw(s.facilityMW), unit: '', sourceId: 'd.facility' },
      { label: 'PUE', value: m.pue.toFixed(2), unit: '', sourceId: 's15.pue' },
      { label: 'Grid allocation', value: fmt.mw(s.allocMW), unit: '', sourceId: 'a.alloc' },
      { label: 'Building cost', value: fmt.usd(s.buildingUSD), unit: '', sourceId: 'ext.cw_build' },
    ];
    if (c) rows.push({ label: 'Cooling', value: c.label, unit: '', sourceId: 's15.pue' });
    return rows;
  }

  function caption(state, metrics) {
    const m = model(state, metrics, catalog);
    if (!m.ok) return m.reason.replace(/\n/g, ' ');
    const s = m.sm;
    return `The ${s.name} building has ${m.halls} halls holding ${fmt.num(m.total)} racks; it draws ${fmt.mw(s.facilityMW)} at PUE ${m.pue.toFixed(2)}.`;
  }

  function dispose() { kit.dispose(group); }

  return { group, update, pickables, tick, legend, readout, caption, dispose };
}
