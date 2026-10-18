// The stage: renderer, desktop camera and controls, lights, the tabletop, level mounting and picking.
// XR reuses all of it (src/xr/xr.js moves and scales stage.table). See STAGE API in contract.js.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TABLE } from '../contract.js';
import * as kit from './kit.js';

const HOME = { pos: new THREE.Vector3(0, 0.82, 1.12), target: new THREE.Vector3(0, 0.2, 0) };
const FIT_HALF_WIDTH = TABLE.halfX + 0.1;   // table plate half-width plus a margin, in metres

export function createStage(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.xr.enabled = true;
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(kit.PALETTE.bg);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 200);
  camera.position.copy(HOME.pos);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(HOME.target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 0.3;
  controls.maxDistance = 3.5;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.update();

  scene.add(new THREE.HemisphereLight('#c9dcff', '#141a24', 1.1));
  const key = new THREE.DirectionalLight('#ffffff', 1.9); key.position.set(1.1, 2.2, 1.4); scene.add(key);
  const rim = new THREE.DirectionalLight('#5ad1ff', 0.6); rim.position.set(-1.6, 0.9, -1.2); scene.add(rim);

  // The tabletop: a plate slightly larger than TABLE space, an edge line and a faint grid.
  const table = new THREE.Group(); table.name = 'table';
  const w = TABLE.halfX * 2 + 0.12, d = TABLE.halfZ * 2 + 0.12;
  const top = kit.box(w, 0.02, d, kit.material(kit.PALETTE.table, { rough: 0.85 }), { radius: 0.01 });
  top.position.y = -0.02; table.add(top);
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, 0.0001, d)),
    new THREE.LineBasicMaterial({ color: kit.PALETTE.tableEdge }));
  edge.position.y = 0.0005; table.add(edge);
  const grid = new THREE.GridHelper(TABLE.halfX * 2, 10, kit.PALETTE.grid, kit.PALETTE.grid);
  grid.position.y = 0.001; grid.material.transparent = true; grid.material.opacity = 0.35; table.add(grid);
  const levelRoot = new THREE.Group(); levelRoot.name = 'levelRoot'; table.add(levelRoot);
  scene.add(table);

  // ---- picking ----
  // Line and point hits default to a 1-unit threshold, which is the whole 1 m table. Keep them tight.
  const PICK_LINE = 0.006, PICK_POINTS = 0.01;
  const raycaster = new THREE.Raycaster();
  function pickFromHit(hit) {
    for (let o = hit.object; o; o = o.parent) {
      if (o.userData && typeof o.userData.pickInstance === 'function' && hit.instanceId != null) {
        const p = o.userData.pickInstance(hit.instanceId); if (p) return p;
      }
      if (o.userData && o.userData.pick) return o.userData.pick;
      if (o === levelRoot) break;
    }
    return null;
  }
  function pickFromRay(rc) {
    rc.params.Line.threshold = PICK_LINE;
    rc.params.Points.threshold = PICK_POINTS;
    const hits = rc.intersectObjects(levelRoot.children, true);
    for (const h of hits) { if (!h.object.visible) continue; const p = pickFromHit(h); if (p) return p; }
    return null;
  }
  const ndc = new THREE.Vector2();
  function pickAtClient(x, y) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    return pickFromRay(raycaster);
  }

  // ---- level mounting with a short scale transition ----
  let current = null;
  function mount(group) {
    const old = current; current = group;
    if (old) {
      const s0 = old.scale.x;
      kit.tween(0.22, (t) => old.scale.setScalar(Math.max(0.001, s0 * (1 - t))), kit.ease.inOut).then(() => levelRoot.remove(old));
    }
    if (group) {
      group.scale.setScalar(0.86);
      levelRoot.add(group);
      kit.tween(0.42, (t) => group.scale.setScalar(0.86 + 0.14 * t), kit.ease.back);
    }
  }

  // The side panels cover part of the canvas, so the home view fits the table into the free strip between them
  // and shifts the projection so the table sits in the middle of that strip.
  const home = { pos: HOME.pos.clone(), target: HOME.target.clone() };
  const homeDir = HOME.pos.clone().sub(HOME.target).normalize();
  const homeDist0 = HOME.pos.distanceTo(HOME.target);
  function freeStrip(W) {
    const left = document.getElementById('panel-scenario'), right = document.querySelector('.side-right');
    if (!left || !right || W < 900) return { frac: 1, shift: 0 };   // narrow screens use bottom sheets
    const lr = left.getBoundingClientRect(), rr = right.getBoundingClientRect(), cr = renderer.domElement.getBoundingClientRect();
    if (!lr.width || !rr.width) return { frac: 1, shift: 0 };
    const a = lr.right - cr.left, b = rr.left - cr.left;
    if (b - a < 240) return { frac: 1, shift: 0 };
    return { frac: (b - a) / W, shift: (a + b) / 2 - W / 2 };
  }
  function fitHome(W, H) {
    const { frac, shift } = freeStrip(W);
    const aspect = (W / Math.max(1, H)) * frac;
    const dist = Math.min(controls.maxDistance * 0.9, Math.max(homeDist0, FIT_HALF_WIDTH / (Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * aspect)));
    home.pos.copy(HOME.target).addScaledVector(homeDir, dist);
    if (shift) camera.setViewOffset(W, H, -shift, 0, W, H); else camera.clearViewOffset();
  }

  function frameTable() {
    const p0 = camera.position.clone(), t0 = controls.target.clone();
    return kit.tween(0.6, (t) => { camera.position.lerpVectors(p0, home.pos, t); controls.target.lerpVectors(t0, home.target, t); controls.update(); });
  }

  // ---- frame loop ----
  const frameFns = new Set();
  const onFrame = (fn) => { frameFns.add(fn); return () => frameFns.delete(fn); };
  const clock = new THREE.Clock();
  renderer.setAnimationLoop((time, frame) => {
    const dt = Math.min(0.1, clock.getDelta()), t = clock.elapsedTime;
    if (!renderer.xr.isPresenting) controls.update();
    kit.setLabelScale(renderer.xr.isPresenting ? 1 : THREE.MathUtils.clamp(camera.position.distanceTo(controls.target) / homeDist0, 1, 2.2), levelRoot);
    kit.tickTweens(dt);
    for (const fn of frameFns) { try { fn(dt, t, frame); } catch (e) { console.error('[stage] frame callback failed', e); frameFns.delete(fn); } }
    renderer.render(scene, camera);
  });

  let homed = false;
  function resize() {
    const W = container.clientWidth || window.innerWidth, H = container.clientHeight || window.innerHeight;
    camera.aspect = W / Math.max(1, H);
    if (!renderer.xr.isPresenting) { renderer.setSize(W, H); fitHome(W, H); }
    camera.updateProjectionMatrix();
    if (!homed && !renderer.xr.isPresenting) { camera.position.copy(home.pos); controls.target.copy(home.target); controls.update(); }
  }
  window.addEventListener('resize', resize);
  resize();
  // The panels are filled after the stage exists; refit once they have laid out.
  requestAnimationFrame(() => requestAnimationFrame(() => { resize(); homed = true; }));

  return { renderer, scene, camera, controls, table, levelRoot, raycaster, pickFromRay, pickAtClient, onFrame, frameTable, mount };
}
