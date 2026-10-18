// One rack (level 'rack'). A cabinet with compute trays (one instanced mesh, one tray per four chips),
// a power shelf at the bottom, and a liquid manifold with coolant particles when the focused site uses
// liquid cooling. On mount the rack rises from the table (0.8 s). Sizes are schematic.
//
// Numbers come from metrics.racksForYear[type] (kW, chips, price, tokens per chip), metrics.sites[site]
// (cooling, rack counts) and catalog.cooling (limits). The level card readout carries the source ids.

import * as THREE from 'three';

export const id = 'rack';

const CAB = { w: 0.30, d: 0.38, h: 0.50, plinth: 0.02, wall: 0.008 };
const SHELF_H = 0.04;
const TRAY_CAP = 96;
const BAR_CAP = 48;
const TRAY_Z = 0.03;
const TRAY_D = 0.30;
const PIPE_X = CAB.w / 2 - 0.035;
const PIPE_Z = -CAB.d / 2 + 0.04;
const CHIPS_PER_TRAY = 4;       // drawing rule only: one tray per four chips
const LIQUID = ['dlc', 'immersion', 'radiators'];
const RISE_SECONDS = 0.8;

const kpcOf = (r) => (r && r.kWPerChip != null ? r.kWPerChip : r && r.chips > 0 ? r.kW / r.chips : NaN);

export function create(ctx) {
  const kit = ctx.kit;
  const { fmt, PALETTE } = kit;
  const catalog = (ctx.data && ctx.data.catalog) || (ctx.app && ctx.app.catalog) || {};

  const root = new THREE.Group();
  root.name = 'level-rack';
  const body = new THREE.Group();   // everything that rises from the table
  root.add(body);

  const NEUTRAL = new THREE.Color('#5c6b86');
  const DIM = new THREE.Color('#5b6577');
  const SHELF_BASE = new THREE.Color(PALETTE.power).multiplyScalar(0.7);

  const cur = { state: null, metrics: null, lens: 'heat', type: 'gpu' };
  let disposed = false;
  let lastKey = null;
  let laidOut = -1;
  let trayCount = 0;
  let riseToken = 0;
  let riseT = 0;
  let liquidOn = false;

  // ---------- cabinet (static) ----------

  const plinth = kit.box(CAB.w + 0.03, CAB.plinth, CAB.d + 0.03, kit.material('#1d2636', { metal: 0.3, rough: 0.5 }));
  body.add(plinth);

  const back = kit.box(CAB.w, CAB.h - CAB.plinth, CAB.wall, kit.material('#222c3d', { metal: 0.3, rough: 0.6 }));
  back.position.set(0, CAB.plinth, -CAB.d / 2 + CAB.wall / 2);
  body.add(back);

  for (const sx of [-1, 1]) {
    const side = kit.box(CAB.wall, CAB.h - CAB.plinth, CAB.d, kit.ghostMaterial());
    side.position.set(sx * (CAB.w / 2 - CAB.wall / 2), CAB.plinth, 0);
    body.add(side);
  }
  const roof = kit.box(CAB.w, CAB.wall, CAB.d, kit.ghostMaterial());
  roof.position.set(0, CAB.h - CAB.wall, 0);
  body.add(roof);

  // Power shelf.
  const shelf = kit.box(CAB.w - 2 * CAB.wall - 0.01, SHELF_H, CAB.d - 0.06,
    kit.material('#ffffff', { metal: 0.3, rough: 0.5, emissive: PALETTE.power, emissiveIntensity: 0.15 }));
  shelf.material.color.copy(SHELF_BASE);
  shelf.position.set(0, CAB.plinth, 0);
  body.add(shelf);

  // Compute trays: fixed capacity, count set per layout.
  const trays = kit.instancedBoxes(TRAY_CAP, kit.material('#ffffff', { metal: 0.3, rough: 0.4 }));
  trays.count = 0;
  trays.userData.pickInstance = () => trayPick();
  body.add(trays);

  // Liquid manifold: two vertical pipes, feeder bars per tray row, coolant particles.
  const manifold = new THREE.Group();
  manifold.visible = false;
  body.add(manifold);
  const pipeH = CAB.h - CAB.plinth - 0.03;
  const supply = kit.cylinder(0.008, 0.008, pipeH, kit.material(PALETTE.water, { metal: 0.2, rough: 0.4 }), 16);
  supply.position.set(-PIPE_X, CAB.plinth + 0.01, PIPE_Z);
  const ret = kit.cylinder(0.008, 0.008, pipeH, kit.material(PALETTE.heat, { metal: 0.2, rough: 0.4 }), 16);
  ret.position.set(PIPE_X, CAB.plinth + 0.01, PIPE_Z);
  manifold.add(supply, ret);

  const bars = kit.instancedBoxes(BAR_CAP, kit.material('#ffffff', { metal: 0.2, rough: 0.4, emissive: PALETTE.water, emissiveIntensity: 0.4 }));
  bars.count = 0;
  manifold.add(bars);

  const yLow = CAB.plinth + 0.03, yHigh = CAB.h - 0.03;
  const flows = [
    kit.flowParticles(new THREE.LineCurve3(new THREE.Vector3(-PIPE_X, yLow, PIPE_Z), new THREE.Vector3(-PIPE_X, yHigh, PIPE_Z)),
      { count: 14, color: PALETTE.water, size: 0.004, speed: 0.3 }),
    kit.flowParticles(new THREE.LineCurve3(new THREE.Vector3(PIPE_X, yHigh, PIPE_Z), new THREE.Vector3(PIPE_X, yLow, PIPE_Z)),
      { count: 14, color: PALETTE.heat, size: 0.004, speed: 0.3 }),
  ];
  for (const f of flows) manifold.add(f.object);

  // ---------- labels (outside the rising body so they stay readable) ----------

  const topLabel = kit.label('Rack', { size: 0.026, color: PALETTE.ink });
  topLabel.position.set(0, CAB.h + 0.06, 0);
  root.add(topLabel);

  const frontLabel = kit.label('Schematic, not to scale', { size: 0.016, color: PALETTE.dim });
  frontLabel.position.set(0, 0.03, CAB.d / 2 + 0.1);
  root.add(frontLabel);

  const shelfLabel = kit.label('Power shelf', { size: 0.016, color: PALETTE.power });
  shelfLabel.position.set(-(CAB.w / 2 + 0.1), CAB.plinth + SHELF_H / 2 + 0.01, 0);
  root.add(shelfLabel);

  const manifoldLabel = kit.label('Liquid manifold', { size: 0.016, color: PALETTE.water });
  manifoldLabel.position.set(CAB.w / 2 + 0.13, CAB.h * 0.55, PIPE_Z);
  root.add(manifoldLabel);

  // ---------- helpers ----------

  function setLabelText(sprite, text) {
    if (!sprite || sprite.userData.lastText === text) return;
    sprite.userData.lastText = text;
    sprite.userData.setText(text);
  }

  /** Everything the rack needs from state + metrics, with fallbacks so a missing field never throws. */
  function resolve(state, metrics) {
    const focus = (state && state.view && state.view.focus) || {};
    const pool = focus.rack === 'prefill' ? 'prefill' : 'decode';
    const site = focus.site || 'wtx';
    const scPool = state && state.scenario && state.scenario.pools && state.scenario.pools[pool];
    const siteM = (metrics && metrics.sites && metrics.sites[site]) || null;
    const type = (scPool && scPool.type) || (siteM && siteM.rackType && siteM.rackType[pool]) || 'gpu';
    const r = (metrics && metrics.racksForYear && metrics.racksForYear[type]) || (catalog.racks && catalog.racks[type]) || null;
    const coolId = (siteM && siteM.cooling) || 'dlc';
    const spec = (catalog.cooling && (catalog.cooling[coolId] || catalog.cooling.dlc)) || null;
    const available = !r || r.available !== false;
    const fits = !!(r && spec && r.kW <= spec.maxRackKW);
    return { pool, site, type, r, siteM, coolId, spec, liquid: LIQUID.indexOf(coolId) >= 0, available, fits };
  }

  /** Source id for a rack field. Interpolated GPU years and stand-in racks come from a.year. */
  function srcFor(R, field) {
    const r = R.r;
    if (!r) return 's12.racks';
    if (!R.available || (R.type === 'gpu' && r.year !== 2035)) return 'a.year';
    return (field && r[`src_${field}`]) || r.src || 's12.racks';
  }

  /** How the active lens maps a value to a colour for this rack. null means n/a at this scale. */
  function lensSpec(lens, R, metrics) {
    const r = R.r;
    if (!r) return null;
    const racks = Object.values((metrics && metrics.racksForYear) || catalog.racks || {});
    const maxOf = (fn) => { const v = racks.map(fn).filter(Number.isFinite); return v.length ? Math.max(...v) : NaN; };
    if (lens === 'heat') {
      return { title: 'Power per chip', value: kpcOf(r), max: maxOf(kpcOf), label: (v) => `${fmt.kw(v)} per chip`, note: 'Rack kW divided by chips, against the hottest chip in the catalog this year (source d.kw_per_chip).' };
    }
    if (lens === 'power') {
      return { title: 'Rack power', value: r.kW, max: maxOf((x) => x.kW), label: (v) => fmt.kw(v), note: 'Rack kW against the largest rack in the catalog this year (source s12.racks).' };
    }
    if (lens === 'cost') {
      return { title: 'Rack price', value: r.costUSD, max: maxOf((x) => x.costUSD), label: (v) => fmt.usd(v), note: 'Rack price against the dearest rack in the catalog this year (source s12.racks).' };
    }
    if (lens === 'water') {
      const waters = Object.values(catalog.cooling || {}).map((c) => c.waterLPerKWh).filter(Number.isFinite);
      return { title: 'Cooling water', value: R.spec ? R.spec.waterLPerKWh : NaN, max: waters.length ? Math.max(...waters) : NaN,
        label: (v) => `${fmt.num(v, 1)} L/kWh`, note: 'Water the focused site cooling uses per kWh (source s15.water).' };
    }
    return null;
  }

  function trayPick() {
    const R = resolve(cur.state, cur.metrics);
    const text = R.r ? `${R.r.label}: one chip, ${fmt.kw(kpcOf(R.r))}` : 'Chip';
    return { level: 'chip', id: R.type, label: text };
  }

  // ---------- layout (only when the tray count changes) ----------

  function layoutTrays(n) {
    const cols = n > 24 ? 2 : 1;
    const rows = Math.max(1, Math.ceil(n / cols));
    const y0 = CAB.plinth + SHELF_H + 0.012;
    const span = CAB.h - CAB.wall - 0.012 - y0;
    const pitch = span / rows;
    const trayH = Math.min(0.02, pitch * 0.7);
    const innerW = CAB.w - 2 * CAB.wall - 0.02;
    for (let i = 0; i < n; i++) {
      const col = Math.floor(i / rows), row = i % rows;
      const x = cols === 1 ? 0 : (col === 0 ? -1 : 1) * (innerW / 4 + 0.003);
      const w = cols === 1 ? innerW : innerW / 2 - 0.008;
      kit.setInstance(trays, i, { x, y: y0 + row * pitch, z: TRAY_Z, sx: w, sy: trayH, sz: TRAY_D, color: NEUTRAL });
    }
    trays.count = n;
    kit.instancesDone(trays);
    for (let r = 0; r < rows; r++) {
      kit.setInstance(bars, r, { x: 0, y: y0 + r * pitch + trayH * 0.4, z: PIPE_Z + 0.02, sx: 2 * PIPE_X, sy: 0.004, sz: 0.04, color: PALETTE.water });
    }
    bars.count = Math.min(rows, BAR_CAP);
    kit.instancesDone(bars);
    laidOut = n;
    trayCount = n;
  }

  // ---------- restyle (cheap, runs on every update) ----------

  function paint(R) {
    const spec = lensSpec(cur.lens, R, cur.metrics);
    let col = NEUTRAL;
    if (!R.available) col = DIM;
    else if (spec) col = kit.ramp(cur.lens, kit.norm(spec.value, 0, spec.max));
    for (let i = 0; i < trayCount; i++) trays.setColorAt(i, col);
    if (trays.instanceColor) trays.instanceColor.needsUpdate = true;
    if (cur.lens === 'power' && spec && R.available) shelf.material.color.copy(col);
    else shelf.material.color.copy(SHELF_BASE);
  }

  function refresh() {
    const R = resolve(cur.state, cur.metrics);
    cur.type = R.type;
    const r = R.r;
    if (!r) {
      if (laidOut !== 0) layoutTrays(0);
      setLabelText(topLabel, 'Rack: no data yet');
      return;
    }
    const n = Math.min(TRAY_CAP, Math.max(1, Math.ceil((Number(r.chips) || 0) / CHIPS_PER_TRAY)));
    if (n !== laidOut) layoutTrays(n);
    paint(R);

    const kwText = `${fmt.kw(r.kW)}, ${fmt.num(r.chips)} chips`;
    setLabelText(topLabel, R.available ? `${r.label} ${kwText}` : `${r.label}\n${kwText}`);

    if (R.spec) {
      const verdict = R.fits ? 'rack within the' : 'rack above the';
      setLabelText(frontLabel, `${R.spec.label}: ${verdict} ${fmt.kw(R.spec.maxRackKW)} limit\nSchematic, not to scale`);
    }

    liquidOn = R.liquid;
    manifold.visible = R.liquid;
    setLabelText(manifoldLabel, R.liquid ? 'Liquid manifold' : 'Air cooled: no liquid manifold');
    const limit = R.spec && R.spec.maxRackKW > 0 ? R.spec.maxRackKW : 1;
    const rate = 0.3 + 1.7 * Math.min(1, (Number(r.kW) || 0) / limit);
    for (const f of flows) f.setRate(R.liquid ? rate : 0);
  }

  // ---------- rise animation ----------

  function applyRise() {
    body.scale.y = Math.max(0.001, riseT);
    topLabel.position.y = (CAB.h + 0.06) * Math.max(0.05, riseT);
    topLabel.visible = riseT > 0.15;
  }

  function rise() {
    const token = ++riseToken;
    riseT = 0;
    applyRise();
    kit.tween(RISE_SECONDS, (e) => {
      if (disposed || token !== riseToken) return;
      riseT = e;
      applyRise();
    }, kit.ease.out);
  }

  rise();
  refresh();

  // ---------- instance interface ----------

  return {
    group: root,
    rise,

    update(state, metrics, lens) {
      cur.state = state || null;
      cur.metrics = metrics || null;
      cur.lens = lens || (state && state.view && state.view.lens) || 'heat';
      const R = resolve(cur.state, cur.metrics);
      const key = `${R.pool}:${R.type}`;
      if (key !== lastKey) {
        const first = lastKey === null;
        lastKey = key;
        if (!first) rise();
      }
      refresh();
    },

    pickables() { return [trays]; },

    tick(dt) {
      if (!liquidOn || !Number.isFinite(dt)) return;
      for (const f of flows) f.tick(dt);
    },

    legend(lens, state, metrics) {
      const R = resolve(state, metrics);
      if (lens === 'sentiment') return { title: 'Sentiment', items: [], note: 'n/a at this scale' };
      const spec = lensSpec(lens, R, metrics);
      if (!spec) return { title: lens, items: [], note: 'n/a: no rack data yet' };
      const note = R.available ? spec.note : `${spec.note} This rack type is not available this year, so its trays are greyed.`;
      return { title: spec.title, items: kit.legendSteps(lens, 0, spec.max, spec.label), note };
    },

    readout(state, metrics) {
      const R = resolve(state, metrics);
      const r = R.r;
      if (!r) return [];
      const rows = [
        { label: 'Rack type', value: String(r.label), unit: '', sourceId: srcFor(R, null) },
        { label: 'Rack power', value: fmt.kw(r.kW), unit: '', sourceId: srcFor(R, 'kW') },
        { label: 'Chips per rack', value: fmt.num(r.chips), unit: '', sourceId: srcFor(R, 'chips') },
        { label: 'Power per chip', value: fmt.kw(kpcOf(r)), unit: '', sourceId: 'd.kw_per_chip' },
        { label: 'Rack price', value: fmt.usd(r.costUSD), unit: '', sourceId: srcFor(R, 'costUSD') },
      ];
      if (R.pool === 'prefill') {
        rows.push({ label: 'Prefill tokens per chip', value: fmt.tokS(r.prefillTokPerChip), unit: '', sourceId: srcFor(R, 'prefillTokPerChip') });
      } else {
        rows.push({ label: 'Decode tokens per chip', value: fmt.tokS(r.decodeAgentTokPerChip), unit: '', sourceId: srcFor(R, 'decodeAgentTokPerChip') });
      }
      if (R.siteM && R.siteM.racks) {
        rows.push({ label: `${R.pool === 'prefill' ? 'Prefill' : 'Decode'} racks at this site`, value: fmt.num(R.siteM.racks[R.pool]), unit: '', sourceId: 'a.alloc' });
      }
      if (R.spec) {
        rows.push({
          label: 'Cooling at this site',
          value: `${R.spec.label}: ${R.fits ? 'fits' : 'too hot'}`,
          unit: `limit ${fmt.kw(R.spec.maxRackKW)} per rack`,
          sourceId: R.spec.src_maxRackKW || R.spec.src || 's15.pue',
        });
        rows.push({
          label: 'Cooling water',
          value: fmt.num(R.spec.waterLPerKWh, 1),
          unit: 'L/kWh',
          sourceId: R.spec.src_waterLPerKWh || R.spec.src || 's15.pue',
        });
      }
      return rows;
    },

    caption(state, metrics) {
      const R = resolve(state, metrics);
      const r = R.r;
      if (!r) return 'One rack on the table: power shelf at the bottom, compute trays above, coolant at the back.';
      const where = R.siteM && R.siteM.name ? ` at ${R.siteM.name}` : '';
      if (!R.spec) return `One ${r.label} draws ${fmt.kw(r.kW)} across ${fmt.num(r.chips)} chips.`;
      const verdict = R.fits ? 'holds up to' : 'tops out at';
      const tail = R.fits ? '' : ', so this rack is too hot for it';
      return `One ${r.label} draws ${fmt.kw(r.kW)} across ${fmt.num(r.chips)} chips; ${R.spec.label.toLowerCase()} cooling${where} ${verdict} ${fmt.kw(R.spec.maxRackKW)} per rack${tail}.`;
    },

    dispose() {
      disposed = true;
      riseToken++;
      kit.dispose(root);
    },
  };
}
