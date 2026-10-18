// Shared scene helpers for every level. Plain three.js; the only DOM use is canvases for label textures.
// Geometry from box(), cylinder() and instancedBoxes() is base-anchored: y = 0 is the bottom face,
// so objects stand on the table (TABLE space, see contract.js) without offset arithmetic.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
export { fmt } from '../ui/common.js';

export const PALETTE = {
  bg: '#0b0f17', table: '#151b26', tableEdge: '#2a3446', grid: '#1f2838', ink: '#e8edf5', dim: '#8a96aa',
  accent: '#5ad1ff', ok: '#3ddc97', warn: '#ffb547', fail: '#ff5c6c',
  gpu: '#7c8cff', lpu: '#38e0c0', air: '#c9a7ff', nvl72: '#9aa4b8',
  prefill: '#ffa94d', decode: '#5ad1ff',
  earth: '#3a7bd5', land: '#7fa6c9', leo: '#c6d3e6', moon: '#b9b4a8', mars: '#d9774b',
  power: '#ffd34d', water: '#4fb3ff', heat: '#ff6b3d', money: '#3ddc97', ghost: '#9fb4d6',
};

// ---------- lens colour ramps ----------

/** Colour stops per lens, low to high. Sentiment runs opposed (low) to supportive (high). */
export const RAMPS = {
  heat: ['#2b6cff', '#34d2c6', '#ffd34d', '#ff6b3d', '#ff2d55'],
  power: ['#1b2a4a', '#3a6df0', '#5ad1ff', '#ffd34d', '#ffffff'],
  cost: ['#3ddc97', '#c6e86b', '#ffb547', '#ff5c6c', '#c13cff'],
  sentiment: ['#ff5c6c', '#ff9f7a', '#9aa4b8', '#8fe0b5', '#3ddc97'],
  water: ['#e8f4ff', '#8fd0ff', '#3a8dff', '#1f4fd1', '#13267a'],
};

const _c = new THREE.Color();
/** Colour for t in [0, 1] on a lens ramp. Returns a new THREE.Color. */
export function ramp(lens, t) {
  const stops = RAMPS[lens] || RAMPS.power;
  const x = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  return new THREE.Color(stops[i]).lerp(_c.set(stops[i + 1]), x - i);
}
export const rampHex = (lens, t) => `#${ramp(lens, t).getHexString()}`;

/** Clamp-normalise v into [0, 1]; log option for values spanning decades. */
export function norm(v, min, max, { log = false } = {}) {
  if (!Number.isFinite(v)) return 0;
  if (log) { const lv = Math.log10(Math.max(v, 1e-12)), a = Math.log10(Math.max(min, 1e-12)), b = Math.log10(Math.max(max, 1e-12)); return b > a ? Math.min(1, Math.max(0, (lv - a) / (b - a))) : 0; }
  return max > min ? Math.min(1, Math.max(0, (v - min) / (max - min))) : 0;
}

/** Legend items for a continuous lens: n swatches labelled with fmtFn(value). */
export function legendSteps(lens, min, max, fmtFn, n = 5, { log = false } = {}) {
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    const v = log ? Math.pow(10, Math.log10(Math.max(min, 1e-12)) + t * (Math.log10(Math.max(max, 1e-12)) - Math.log10(Math.max(min, 1e-12)))) : min + t * (max - min);
    return { color: rampHex(lens, t), label: fmtFn(v) };
  });
}

// ---------- materials ----------

const shared = new Map();
/** A new MeshStandardMaterial (safe to recolour per object). */
export function material(color = PALETTE.ink, { metal = 0.1, rough = 0.6, opacity = 1, emissive = null, emissiveIntensity = 0.6, side = THREE.FrontSide, flat = false } = {}) {
  const m = new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough, transparent: opacity < 1, opacity, side, flatShading: flat });
  if (opacity < 1) m.depthWrite = false;
  if (emissive) { m.emissive = new THREE.Color(emissive); m.emissiveIntensity = emissiveIntensity; }
  return m;
}
/** A cached material for static parts. Do not recolour it; dispose() skips it. */
export function sharedMaterial(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!shared.has(key)) { const m = material(color, opts); m.userData.shared = true; shared.set(key, m); }
  return shared.get(key);
}
/** Translucent "ghost" material for planned or not-yet-built volumes. */
export const ghostMaterial = (color = PALETTE.ghost, opacity = 0.22) => material(color, { opacity, rough: 0.2, metal: 0, side: THREE.DoubleSide });

// ---------- geometry ----------

const asMat = (m) => (m instanceof THREE.Material ? m : material(m));

/** Box with its base at y = 0. radius > 0 gives rounded edges. */
export function box(w, h, d, mat = PALETTE.ink, { radius = 0 } = {}) {
  const g = radius > 0 ? new RoundedBoxGeometry(w, h, d, 2, Math.min(radius, w / 2, h / 2, d / 2)) : new THREE.BoxGeometry(w, h, d);
  g.translate(0, h / 2, 0);
  return new THREE.Mesh(g, asMat(mat));
}
/** Cylinder with its base at y = 0. */
export function cylinder(rTop, rBottom, h, mat = PALETTE.ink, segments = 24) {
  const g = new THREE.CylinderGeometry(rTop, rBottom, h, segments);
  g.translate(0, h / 2, 0);
  return new THREE.Mesh(g, asMat(mat));
}
/** Thin plate lying on the table, top face at y = h. */
export function plate(w, d, mat = PALETTE.table, h = 0.004) { return box(w, h, d, mat); }

/**
 * n base-anchored unit boxes in one draw call. Place each with setInstance(); colours use instanceColor.
 * Pass the material; vertex colours multiply it, so use a white or light base colour.
 */
export function instancedBoxes(n, mat = material('#ffffff')) {
  const g = new THREE.BoxGeometry(1, 1, 1); g.translate(0, 0.5, 0);
  const im = new THREE.InstancedMesh(g, asMat(mat), Math.max(1, n));
  im.count = n;
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  im.setColorAt(0, new THREE.Color('#ffffff'));
  return im;
}
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
/** Position, size and colour instance i of an instancedBoxes() mesh. Set needsUpdate after the loop. */
export function setInstance(im, i, { x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rotY = 0, color = null }) {
  _q.setFromAxisAngle(_p.set(0, 1, 0), rotY);
  im.setMatrixAt(i, _m4.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz)));
  if (color != null) im.setColorAt(i, color instanceof THREE.Color ? color : _c.set(color));
}
export function instancesDone(im) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; im.computeBoundingSphere(); }

/** Points cloud from [[x,y,z], ...] (fixed pixel size; sizeAttenuation off reads better at tabletop scale). */
export function dots(positions, { size = 2, color = PALETTE.land, opacity = 1, colors = null } = {}) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions.flat(), 3));
  if (colors) g.setAttribute('color', new THREE.Float32BufferAttribute(colors.flat(), 3));
  const m = new THREE.PointsMaterial({ size, color: colors ? '#ffffff' : color, vertexColors: !!colors, sizeAttenuation: false, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
  return new THREE.Points(g, m);
}

/** Polyline through points ([[x,y,z]] or Vector3s). */
export function line(points, { color = PALETTE.dim, opacity = 1 } = {}) {
  const pts = points.map((p) => (p.isVector3 ? p : new THREE.Vector3(...p)));
  const g = new THREE.BufferGeometry().setFromPoints(pts);
  return new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity }));
}
/** Tube along a smooth curve through points; good for power, water and money flows. */
export function tube(points, radius = 0.003, mat = PALETTE.power, segments = 48) {
  const pts = points.map((p) => (p.isVector3 ? p : new THREE.Vector3(...p)));
  const curve = new THREE.CatmullRomCurve3(pts);
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, segments, radius, 8, false), asMat(mat));
  m.userData.curve = curve;
  return m;
}

/**
 * Animated particles running along a curve (power, data or money flow).
 * Returns { object, tick(dt), setRate(r) }; call tick from the level's tick(dt).
 */
export function flowParticles(curve, { count = 24, color = PALETTE.power, size = 0.006, speed = 0.25 } = {}) {
  const g = new THREE.SphereGeometry(size, 8, 6);
  const im = new THREE.InstancedMesh(g, material(color, { emissive: color, emissiveIntensity: 1.2 }), count);
  const offs = Array.from({ length: count }, (_, i) => i / count);
  let rate = 1;
  const pos = new THREE.Vector3();
  const tick = (dt) => {
    for (let i = 0; i < count; i++) {
      offs[i] = (offs[i] + dt * speed * rate) % 1;
      curve.getPointAt(offs[i], pos);
      im.setMatrixAt(i, _m4.makeTranslation(pos.x, pos.y, pos.z));
    }
    im.instanceMatrix.needsUpdate = true;
  };
  tick(0);
  return { object: im, tick, setRate: (r) => { rate = r; im.visible = r > 0; } };
}

/** Unit-sphere position for lat/lon in degrees (y up, lon 0 facing +z). */
export function latLonToVec3(lat, lon, r = 1, out = new THREE.Vector3()) {
  const phi = THREE.MathUtils.degToRad(90 - lat), th = THREE.MathUtils.degToRad(lon + 90);
  return out.set(-r * Math.sin(phi) * Math.cos(th), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(th));
}
/** Points on a raised arc between two surface points of a globe of radius r (for links between sites). */
export function arcPoints(a, b, r, lift = 0.15, n = 32) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, p = new THREE.Vector3().copy(a).lerp(b, t).normalize();
    out.push(p.multiplyScalar(r * (1 + lift * Math.sin(Math.PI * t))));
  }
  return out;
}

/** Positions for n items in a cols x rows grid filling w x d, centred on the origin. */
export function gridLayout(n, w, d, { gap = 0.15, aspect = 1 } = {}) {
  if (n <= 0) return { cols: 0, rows: 0, cellW: 0, cellD: 0, positions: [] };
  const cols = Math.max(1, Math.round(Math.sqrt((n * w) / (d * aspect)))), rows = Math.ceil(n / cols);
  const cellW = w / cols, cellD = d / rows, positions = [];
  for (let i = 0; i < n; i++) {
    const c = i % cols, r = Math.floor(i / cols);
    positions.push({ x: -w / 2 + cellW * (c + 0.5), z: -d / 2 + cellD * (r + 0.5), w: cellW * (1 - gap), d: cellD * (1 - gap) });
  }
  return { cols, rows, cellW, cellD, positions };
}

/** Mark an object as pickable (see contract: userData.pick). Returns the object. */
export function pickable(obj, pick) { obj.userData.pick = pick; return obj; }

// ---------- labels ----------

/**
 * Text sprite. size = height in metres of one text line. Multi-line with '\n'.
 * The sprite has userData.setText(text) to update it without a new texture.
 */
let labelScale = 1;
/** Labels keep their on-screen size when the desktop camera moves back. The stage sets this every frame (1 in XR). */
export function setLabelScale(f, root) {
  if (Math.abs(f - labelScale) < 0.01) return;
  labelScale = f;
  if (root) root.traverse((o) => { const b = o.userData && o.userData.labelBase; if (b) o.scale.set(b[0] * f, b[1] * f, 1); });
}

export function label(text, { size = 0.022, color = PALETTE.ink, bg = 'rgba(11,15,23,0.80)', weight = 600, border = null, onTop = false, align = 'center' } = {}) {
  const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: !onTop, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  const PX = 44, PAD = 14;
  const draw = (t) => {
    const lines = String(t).split('\n');
    ctx.font = `${weight} ${PX}px Inter, system-ui, -apple-system, sans-serif`;
    const tw = Math.ceil(Math.max(...lines.map((l) => ctx.measureText(l).width)));
    canvas.width = tw + PAD * 2; canvas.height = lines.length * PX * 1.25 + PAD * 2;
    ctx.font = `${weight} ${PX}px Inter, system-ui, -apple-system, sans-serif`;
    if (bg) {
      ctx.fillStyle = bg; const r = 12, W = canvas.width, H = canvas.height;
      ctx.beginPath(); ctx.moveTo(r, 0); ctx.arcTo(W, 0, W, H, r); ctx.arcTo(W, H, 0, H, r); ctx.arcTo(0, H, 0, 0, r); ctx.arcTo(0, 0, W, 0, r); ctx.fill();
      if (border) { ctx.strokeStyle = border; ctx.lineWidth = 4; ctx.stroke(); }
    }
    ctx.fillStyle = color; ctx.textBaseline = 'middle'; ctx.textAlign = align;
    const x = align === 'left' ? PAD : align === 'right' ? canvas.width - PAD : canvas.width / 2;
    lines.forEach((l, i) => ctx.fillText(l, x, PAD + PX * 1.25 * (i + 0.5)));
    tex.needsUpdate = true;
    const h = size * lines.length * 1.25 + (size * PAD * 2) / PX;
    sprite.userData.labelBase = [(h * canvas.width) / canvas.height, h];
    sprite.scale.set(sprite.userData.labelBase[0] * labelScale, h * labelScale, 1);
  };
  draw(text);
  sprite.userData.setText = draw;
  sprite.renderOrder = onTop ? 10 : 0;
  return sprite;
}

// ---------- tweens ----------

const tweens = new Set();
export const ease = {
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
  back: (t) => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2),
};
/** Animate 0 -> 1 over dur seconds, calling onUpdate(eased t). Resolves when done. The stage ticks it. */
export function tween(dur, onUpdate, easing = ease.inOut) {
  return new Promise((resolve) => {
    const tw = { t: 0, dur: Math.max(0.001, dur), onUpdate, easing, resolve };
    tweens.add(tw); onUpdate(0);
  });
}
/** Called once per frame by the stage. */
export function tickTweens(dt) {
  for (const tw of tweens) {
    tw.t = Math.min(1, tw.t + dt / tw.dur);
    tw.onUpdate(tw.easing(tw.t));
    if (tw.t >= 1) { tweens.delete(tw); tw.resolve(); }
  }
}

// ---------- cleanup ----------

/** Dispose geometries, non-shared materials and textures under obj. */
export function dispose(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) { if (m.userData && m.userData.shared) continue; if (m.map) m.map.dispose(); m.dispose(); }
  });
}
