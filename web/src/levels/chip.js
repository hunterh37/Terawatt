// Chip workbench (level 'chip'). One package on the table: a substrate, an interposer, compute dies
// (stacked into 3D layers), HBM stacks along the two side edges (slide 28 layout), and a power-delivery
// block at the back. Power flows from that block into each die. Sizes are schematic: the package is
// enlarged to fill the table and layer heights are exaggerated.
//
// Numbers come from metrics.chip (engine) and catalog.chipLab. In-scene labels show metrics values;
// the level card readout carries the source id for every row.

import * as THREE from 'three';

export const id = 'chip';

// Schematic dimensions in millimetres of package space (scaled to the table at build time).
const GAP = 1.5;
const MARGIN = 4;
const SUB_MARGIN = 5;
const PB_DEPTH = 9;
const PB_GAP = 3;
const HBM_PER_COL = 4;
const H = { sub: 2.5, inter: 1.2, layer: 2.6, pitch: 3.2, hbm: 5.5, pb: 6 };

const clampInt = (x, lo, hi, d) => {
  const n = Math.round(Number(x));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};

export function create(ctx) {
  const kit = ctx.kit;
  const { fmt, PALETTE } = kit;
  const catalog = (ctx.data && ctx.data.catalog) || (ctx.app && ctx.app.catalog) || {};
  const lab = catalog.chipLab || {};
  const dieMM = lab.gpuDieMM || [11.5, 10.5];
  const hbmMM = lab.hbmDieMM || [10.5, 10.2];
  const heatScale = lab.heatScaleWPerCm2;

  const group = new THREE.Group();
  group.name = 'level-chip';

  let dyn = null;
  let dieMesh = null, hbmMesh = null;
  let flows = [];
  let nDie = 0, nHbm = 0;
  let badgeLiquid = null, badgeAir = null;
  const built = { dies: 0, hbm: 0, stack: 0 };
  const cur = { state: null, metrics: null, lens: 'heat', type: 'gpu' };

  const NEUTRAL_DIE = new THREE.Color('#5c6b86');
  const NEUTRAL_HBM = new THREE.Color('#47546b');

  // ---------- layout (package space, mm) ----------

  function planLayout(dies, hbm) {
    const dRows = dies <= 2 ? 1 : 2;
    const dCols = Math.ceil(dies / dRows);
    const cw = dCols * dieMM[0] + (dCols - 1) * GAP;
    const cd = dRows * dieMM[1] + (dRows - 1) * GAP;
    const left = Math.ceil(hbm / 2), right = hbm - left;
    const colsL = Math.ceil(left / HBM_PER_COL), colsR = Math.ceil(right / HBM_PER_COL);
    const sideW = Math.max(colsL, colsR) * (hbmMM[0] + GAP);
    const colDepth = (n) => (n > 0 ? Math.min(HBM_PER_COL, n) * (hbmMM[1] + GAP) - GAP : 0);
    const hbmDepth = Math.max(colDepth(left), colDepth(right));
    const iw = 2 * MARGIN + 2 * sideW + cw;
    const idp = 2 * MARGIN + Math.max(cd, hbmDepth);
    const sw = iw + 2 * SUB_MARGIN, sd = idp + 2 * SUB_MARGIN;
    const totalD = sd + PB_GAP + PB_DEPTH;
    const subZ = totalD / 2 - sd / 2;
    const pbZ = -totalD / 2 + PB_DEPTH / 2;

    const dieSlots = [];
    for (let i = 0; i < dies; i++) {
      const row = Math.floor(i / dCols), col = i % dCols;
      dieSlots.push({
        x: (col - (dCols - 1) / 2) * (dieMM[0] + GAP),
        z: subZ + (row - (dRows - 1) / 2) * (dieMM[1] + GAP),
      });
    }
    const hbmSlots = [];
    const addSide = (n, sign) => {
      for (let i = 0; i < n; i++) {
        const c = Math.floor(i / HBM_PER_COL), r = i % HBM_PER_COL;
        const inCol = Math.min(HBM_PER_COL, n - c * HBM_PER_COL);
        hbmSlots.push({
          x: sign * (cw / 2 + GAP + hbmMM[0] / 2 + c * (hbmMM[0] + GAP)),
          z: subZ + (r - (inCol - 1) / 2) * (hbmMM[1] + GAP),
        });
      }
    };
    addSide(left, -1);
    addSide(right, 1);
    return { iw, idp, sw, sd, totalD, subZ, pbZ, dieSlots, hbmSlots };
  }

  // ---------- build (only when counts change) ----------

  function build(dies, hbm, stack) {
    if (dyn) { group.remove(dyn); kit.dispose(dyn); }
    dyn = new THREE.Group();
    group.add(dyn);
    flows = [];
    built.dies = dies; built.hbm = hbm; built.stack = stack;

    const p = planLayout(dies, hbm);
    const k = Math.min(0.92 / p.sw, 0.8 / p.totalD, 0.02);
    const mm = (v) => v * k;
    const baseY = H.sub + H.inter;
    const topY = mm(baseY + (stack - 1) * H.pitch + H.layer);

    const sub = kit.box(mm(p.sw), mm(H.sub), mm(p.sd), kit.material('#1d2636', { metal: 0.3, rough: 0.5 }), { radius: mm(1) });
    sub.position.set(0, 0, mm(p.subZ));
    dyn.add(sub);

    const inter = kit.box(mm(p.iw), mm(H.inter), mm(p.idp), kit.material('#3b4a66', { metal: 0.4, rough: 0.35 }));
    inter.position.set(0, mm(H.sub), mm(p.subZ));
    dyn.add(inter);

    const pb = kit.box(mm(p.sw), mm(H.pb), mm(PB_DEPTH),
      kit.material('#3a3320', { metal: 0.3, rough: 0.5, emissive: PALETTE.power, emissiveIntensity: 0.3 }), { radius: mm(0.6) });
    pb.position.set(0, 0, mm(p.pbZ));
    dyn.add(pb);

    // Compute dies: one instanced mesh, layer-major (index = layer * dies + die).
    nDie = dies * stack;
    dieMesh = kit.instancedBoxes(nDie, kit.material('#ffffff', { metal: 0.25, rough: 0.35 }));
    for (let l = 0; l < stack; l++) {
      for (let i = 0; i < dies; i++) {
        const q = p.dieSlots[i];
        kit.setInstance(dieMesh, l * dies + i, {
          x: mm(q.x), y: mm(baseY + l * H.pitch), z: mm(q.z), sx: mm(dieMM[0]), sy: mm(H.layer), sz: mm(dieMM[1]),
        });
      }
    }
    kit.instancesDone(dieMesh);
    dieMesh.userData.pickInstance = () => dieLabelPick();
    dyn.add(dieMesh);

    // HBM stacks: one instanced mesh.
    nHbm = hbm;
    hbmMesh = kit.instancedBoxes(nHbm, kit.material('#ffffff', { metal: 0.2, rough: 0.45 }));
    for (let i = 0; i < nHbm; i++) {
      const q = p.hbmSlots[i];
      kit.setInstance(hbmMesh, i, { x: mm(q.x), y: mm(baseY), z: mm(q.z), sx: mm(hbmMM[0]), sy: mm(H.hbm), sz: mm(hbmMM[1]) });
    }
    kit.instancesDone(hbmMesh);
    dyn.add(hbmMesh);

    // Power flow: from the front edge of the power block, over the package, down onto each die.
    const pbFrontZ = mm(p.pbZ + PB_DEPTH / 2);
    const hover = topY + 0.045;
    for (let i = 0; i < dies; i++) {
      const q = p.dieSlots[i], x = mm(q.x), zd = mm(q.z);
      const pts = [
        new THREE.Vector3(x, mm(H.pb), pbFrontZ),
        new THREE.Vector3(x, hover, pbFrontZ + (zd - pbFrontZ) * 0.5),
        new THREE.Vector3(x, hover, zd),
        new THREE.Vector3(x, topY, zd),
      ];
      const curve = new THREE.CatmullRomCurve3(pts);
      dyn.add(kit.line(curve.getPoints(24), { color: PALETTE.power, opacity: 0.3 }));
      const f = kit.flowParticles(curve, { count: 8, color: PALETTE.power, size: 0.004, speed: 0.3 });
      flows.push(f);
      dyn.add(f.object);
    }

    // Labels.
    const title = kit.label(titleText(dies, hbm, stack), { size: 0.016, color: PALETTE.dim });
    title.position.set(0, 0.03, mm(p.totalD / 2) + 0.05);
    dyn.add(title);

    const pbLabel = kit.label('Power delivery', { size: 0.018, color: PALETTE.power });
    pbLabel.position.set(0, mm(H.pb) + 0.03, mm(p.pbZ));
    dyn.add(pbLabel);

    badgeLiquid = kit.label('Needs liquid cooling', { size: 0.02, color: PALETTE.warn, border: PALETTE.warn });
    badgeAir = kit.label('Air cooling is enough', { size: 0.02, color: PALETTE.ok, border: PALETTE.ok });
    for (const b of [badgeLiquid, badgeAir]) {
      b.position.set(0, topY + 0.13, mm(p.subZ));
      b.visible = false;
      dyn.add(b);
    }

    paint();
    updateBadges();
    applyFlow();
  }

  function titleText(dies, hbm, stack) {
    return `${dies} compute dies, ${hbm} HBM stacks, ${stack} ${stack === 1 ? 'layer' : 'layers'}\nSchematic, not to scale (enlarged to fill the table)`;
  }

  // ---------- lens colours ----------

  function hbmFluxOf(c) {
    const area = (hbmMM[0] * hbmMM[1]) / 100; // cm2
    return area > 0 ? (c.hbmW / Math.max(1, c.hbm)) / area : NaN;
  }

  function perChipCostOf(m, type) {
    const r = m && m.racksForYear && m.racksForYear[type];
    return r && r.chips > 0 ? r.costUSD / r.chips : NaN;
  }

  function maxPerChipCost(m) {
    const list = Object.values((m && m.racksForYear) || {})
      .map((r) => (r && r.chips > 0 ? r.costUSD / r.chips : NaN)).filter(Number.isFinite);
    return list.length ? Math.max(...list) : NaN;
  }

  function lensColours() {
    const m = cur.metrics, c = m && m.chip;
    if (!c) return { die: NEUTRAL_DIE, hbm: NEUTRAL_HBM };
    if (cur.lens === 'heat') {
      return {
        die: kit.ramp('heat', kit.norm(c.heatFluxWPerCm2, 0, heatScale)),
        hbm: kit.ramp('heat', kit.norm(hbmFluxOf(c), 0, heatScale)),
      };
    }
    if (cur.lens === 'power') {
      const dieW = c.computeW / Math.max(1, c.dies), hbmW = c.hbmW / Math.max(1, c.hbm);
      const top = Math.max(dieW, hbmW, 1e-9);
      return { die: kit.ramp('power', kit.norm(dieW, 0, top)), hbm: kit.ramp('power', kit.norm(hbmW, 0, top)) };
    }
    if (cur.lens === 'cost') {
      const col = kit.ramp('cost', kit.norm(perChipCostOf(m, c.type), 0, maxPerChipCost(m)));
      return { die: col, hbm: col.clone() };
    }
    return { die: NEUTRAL_DIE, hbm: NEUTRAL_HBM };
  }

  function paint() {
    if (!dieMesh || !hbmMesh) return;
    const cols = lensColours();
    for (let i = 0; i < nDie; i++) dieMesh.setColorAt(i, cols.die);
    for (let i = 0; i < nHbm; i++) hbmMesh.setColorAt(i, cols.hbm);
    if (dieMesh.instanceColor) dieMesh.instanceColor.needsUpdate = true;
    if (hbmMesh.instanceColor) hbmMesh.instanceColor.needsUpdate = true;
  }

  // ---------- badges, flow, pick ----------

  function setLabelText(sprite, text) {
    if (!sprite || sprite.userData.lastText === text) return;
    sprite.userData.lastText = text;
    sprite.userData.setText(text);
  }

  function updateBadges() {
    const c = cur.metrics && cur.metrics.chip;
    if (!badgeLiquid || !badgeAir) return;
    if (!c) { badgeLiquid.visible = false; badgeAir.visible = false; return; }
    const spec = (catalog.cooling && catalog.cooling[c.siteCooling]) || null;
    const fit = spec ? (c.coolingOk ? 'site cooling holds it' : 'site cooling is too weak') : 'site cooling n/a';
    const second = `Rack at this power: ${fmt.kw(c.rackKW)}, ${fit}`;
    setLabelText(badgeLiquid, `Needs liquid cooling\n${second}`);
    setLabelText(badgeAir, `Air cooling is enough\n${second}`);
    badgeLiquid.visible = !!c.needsLiquid;
    badgeAir.visible = !c.needsLiquid;
  }

  function applyFlow() {
    const c = cur.metrics && cur.metrics.chip;
    const on = c ? c.powerFlow !== false : true;
    const kW = c && Number.isFinite(c.kW) ? c.kW : 1;
    const rate = on ? Math.min(6, 0.25 + kW * 0.3) : 0;
    for (const f of flows) f.setRate(rate);
  }

  function dieLabelPick() {
    const c = cur.metrics && cur.metrics.chip;
    const text = c ? `Compute die: ${fmt.num(c.heatFluxWPerCm2)} W/cm2 heat flux, ${fmt.w(c.computeW)} across ${c.dies} dies` : 'Compute die';
    return { level: 'chip', id: cur.type, label: text };
  }

  // ---------- initial build with catalog defaults ----------

  build(clampInt(lab.dies, 1, 12, 4), clampInt(lab.hbm, 2, 24, 4), 1);

  // ---------- instance interface ----------

  return {
    group,

    update(state, metrics, lens) {
      cur.state = state || null;
      cur.metrics = metrics || null;
      cur.lens = lens || (state && state.view && state.view.lens) || 'heat';
      const c = metrics && metrics.chip;
      if (c) {
        cur.type = c.type || cur.type;
        const dies = clampInt(c.dies, 1, 12, built.dies);
        const hbm = clampInt(c.hbm, 2, 24, built.hbm);
        const stack = clampInt(c.stack, 1, 4, built.stack);
        if (dies !== built.dies || hbm !== built.hbm || stack !== built.stack) build(dies, hbm, stack);
      }
      paint();
      updateBadges();
      applyFlow();
    },

    pickables() { return dieMesh ? [dieMesh] : []; },

    tick(dt) {
      if (!Number.isFinite(dt)) return;
      for (const f of flows) f.tick(dt);
    },

    legend(lens, state, metrics) {
      const c = metrics && metrics.chip;
      if (lens === 'heat') {
        return {
          title: 'Heat flux (watts per cm2)',
          items: kit.legendSteps('heat', 0, heatScale, (v) => `${fmt.num(v)} W/cm2`),
          note: 'Compute dies use chip watts over die area; HBM stacks use their own watts over their own area. The scale is a display range, not a limit (source a.heat_scale).',
        };
      }
      if (lens === 'power') {
        if (!c) return { title: 'Power per part', items: [], note: 'n/a: no chip data yet' };
        const top = Math.max(c.computeW / Math.max(1, c.dies), c.hbmW / Math.max(1, c.hbm), 1e-9);
        return {
          title: 'Power per part',
          items: kit.legendSteps('power', 0, top, (v) => fmt.w(v)),
          note: 'One compute die (all its layers) and one HBM stack, against the larger of the two.',
        };
      }
      if (lens === 'cost') {
        const top = maxPerChipCost(metrics);
        if (!Number.isFinite(top)) return { title: 'Price per chip', items: [], note: 'n/a: no rack price yet' };
        return {
          title: 'Price per chip',
          items: kit.legendSteps('cost', 0, top, (v) => fmt.usd(v)),
          note: 'Rack price divided by its chips; the whole package shares one colour.',
        };
      }
      if (lens === 'water') return { title: 'Water', items: [], note: 'n/a at this scale: a chip does not use water; cooling water appears at the rack and site levels.' };
      return { title: 'Sentiment', items: [], note: 'n/a at this scale' };
    },

    readout(state, metrics) {
      const c = metrics && metrics.chip;
      if (!c) return [];
      const spec = (catalog.cooling && catalog.cooling[c.siteCooling]) || null;
      const rows = [
        { label: 'Chip power', value: fmt.kw(c.kW), unit: '', sourceId: 'd.kw_per_chip' },
        { label: 'Compute power', value: fmt.w(c.computeW), unit: '', sourceId: 'a.chip_dies' },
        { label: 'HBM power', value: fmt.w(c.hbmW), unit: `from ${fmt.num(c.hbm)} stacks`, sourceId: 'tw.hbm_w' },
        { label: 'Die area', value: fmt.num(c.dieAreaMM2), unit: 'mm2', sourceId: 's28.dies' },
        { label: 'Heat flux', value: fmt.num(c.heatFluxWPerCm2), unit: 'W/cm2', sourceId: 'd.heatflux' },
        { label: 'Rack at this chip power', value: fmt.kw(c.rackKW), unit: '', sourceId: 'd.kw_per_chip' },
      ];
      if (spec) {
        rows.push({
          label: 'Cooling fit',
          value: `${spec.label}: ${c.coolingOk ? 'fits' : 'too hot'}`,
          unit: `limit ${fmt.kw(spec.maxRackKW)} per rack`,
          sourceId: spec.src_maxRackKW || spec.src || 's15.pue',
        });
      }
      rows.push({ label: 'Needs liquid cooling', value: c.needsLiquid ? 'Yes' : 'No', unit: '', sourceId: 's15.pue' });
      rows.push({ label: 'Layout', value: `${fmt.num(c.dies)} dies, ${fmt.num(c.hbm)} HBM, ${fmt.num(c.stack)} layers`, unit: '', sourceId: 'a.chip_dies' });
      return rows;
    },

    caption(state, metrics) {
      const c = metrics && metrics.chip;
      if (!c) return 'One chip package on the table: compute dies in the middle, memory stacks on the sides, power in from the back.';
      const cool = c.needsLiquid ? 'it needs liquid cooling' : 'air cooling is enough';
      return `A chip from the ${c.label} draws ${fmt.kw(c.kW)} through ${fmt.num(c.dies)} compute dies, a heat flux of ${fmt.num(c.heatFluxWPerCm2)} W/cm2, so ${cool}.`;
    },

    dispose() {
      if (dyn) { group.remove(dyn); kit.dispose(dyn); dyn = null; }
      flows = []; dieMesh = null; hbmMesh = null;
    },
  };
}
