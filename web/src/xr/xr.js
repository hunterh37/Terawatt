// XR module: Enter VR / AR button, table placement, pinch picking and an in-world control panel.
// Entry point (see contract.js): installXR({ THREE, stage, app, kit, slot }) -> { dispose }.
//
// What it does:
//  - Adds a button to `slot`: XRButton when immersive-ar is supported (passthrough where the browser allows it),
//    else VRButton (immersive-vr, which is what Safari on Apple Vision Pro offers). With no WebXR it shows a note.
//  - On session start: disables OrbitControls, puts stage.table in front of the viewer at desk height.
//  - On 'select' (controller trigger, or the gaze-and-pinch of Vision Pro, which reports targetRayMode
//    'transient-pointer'): builds a ray from the input source pose in the event frame and picks.
//  - Draws a small canvas panel (lens, year, preset, zoom out, life size, recentre) and maps ray hits to buttons.
//  - Life size: scales stage.table up at the hall level so racks read near real size, and back down elsewhere.
//  - On session end: restores everything it changed.
// Every number shown comes from app state, the engine PARAMS or the metrics. The only numbers typed here are
// layout constants in metres, seconds and pixels that are never shown to the viewer.

import { XRButton } from 'three/addons/webxr/XRButton.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { LEVEL_TITLES, LENSES, LENS_TITLES } from '../contract.js';
import { el } from '../ui/common.js';

const LAYOUT = {
  deskHeight: 0.8,        // table surface above the floor (m)
  tableDistance: 0.6,     // table centre in front of the viewer (m)
  eyeToDesk: 0.55,        // fallback when the space has no floor: desk this far below the head (m)
  panelW: 0.56,           // panel width (m); height follows the canvas aspect
  panelBehind: 1.3,       // panel distance from the viewer, behind the table (m)
  panelAboveDesk: 0.75,   // panel centre above the desk (m)
  panelNear: 0.8,         // panel distance from the viewer in life-size mode (m)
  panelNearDrop: 0.25,    // panel sits this far below the head in life-size mode (m)
  lifeScale: 25,          // table scale in life-size mode
  lifeSeconds: 0.8,       // tween time for life size
  settleFrames: 3,        // frames to wait after the session starts before reading the head pose
  flashMs: 260,
};
const CW = 1000, CH = 640;           // panel canvas size in pixels
const FONT = 'Inter, system-ui, -apple-system, sans-serif';
const NOTE = 'Open on Vision Pro for XR';
const SITE_BOUND = ['site', 'building', 'hall', 'rack', 'chip'];

const CSS = [
  '.xr-holder { display: inline-flex; align-items: center; }',
  '.xr-holder button, .xr-holder a { position: static !important; left: auto !important; bottom: auto !important; width: auto !important;',
  ' padding: 6px 12px !important; border: 1px solid var(--line, #263147) !important; border-radius: 999px !important;',
  ' background: var(--surface-2, #1a2232) !important; color: var(--ink, #e8edf5) !important; opacity: 1 !important;',
  ' font: 600 13px var(--font, system-ui, sans-serif) !important; text-decoration: none !important; cursor: pointer; white-space: nowrap; }',
  '.xr-holder button:hover { border-color: var(--accent, #5ad1ff) !important; }',
  '.xr-note { color: var(--dim, #8a96aa); font-size: 12px; white-space: nowrap; }',
].join('\n');

// ---------- small canvas helpers ----------

function roundRectPath(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Clip text with three dots so it fits maxW at the current font. */
function clipText(g, text, maxW) {
  let t = String(text == null ? '' : text);
  if (g.measureText(t).width <= maxW) return t;
  while (t.length > 1 && g.measureText(`${t}...`).width > maxW) t = t.slice(0, -1);
  return `${t}...`;
}

/** Word-wrap into at most maxLines lines at the current font. */
function wrapLines(g, text, maxW, maxLines) {
  const words = String(text == null ? '' : text).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (let i = 0; i < words.length; i++) {
    const test = cur ? `${cur} ${words[i]}` : words[i];
    if (!cur || g.measureText(test).width <= maxW) cur = test;
    else { lines.push(cur); cur = words[i]; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = `${lines[maxLines - 1]} ...`; }
  return lines.map((l) => clipText(g, l, maxW));
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ---------- install ----------

export function installXR({ THREE, stage, app, kit, slot }) {
  const noop = { dispose() {} };
  if (!slot || !stage || !stage.renderer || !app || !THREE || !kit) return noop;

  const renderer = stage.renderer;
  const table = stage.table;
  const P = kit.PALETTE;
  let disposed = false;
  let active = false;
  let curSession = null;
  let saved = null;
  let anchor = null;        // { head, dir, deskY, floorY, tx, tz } set when the table is placed
  let placePending = false;
  let settle = 0;
  let lifeOn = false;       // the "life size" toggle
  let lifeT = 0;            // 0..1 progress of the life-size tween
  let lifeE = 0;            // eased lifeT
  let dirty = true;
  let buttons = [];
  let flashId = null;
  let flashUntil = 0;
  const offs = [];

  // ---------- slot UI ----------

  const holder = el('div', { class: 'xr-holder' });
  slot.append(el('style', {}, CSS), holder);
  const showNote = (text) => holder.replaceChildren(el('span', { class: 'xr-note' }, text));

  async function mountButton() {
    const xr = typeof navigator !== 'undefined' ? navigator.xr : null;
    if (!xr || typeof xr.isSessionSupported !== 'function') { showNote(NOTE); return; }
    const supports = async (mode) => { try { return !!(await xr.isSessionSupported(mode)); } catch (e) { return false; } };
    const ar = await supports('immersive-ar');
    const vr = ar ? false : await supports('immersive-vr');
    if (disposed) return;
    if (!ar && !vr) { showNote(NOTE); return; }
    try {
      const btn = ar
        ? XRButton.createButton(renderer, { optionalFeatures: ['local-floor'] })
        : VRButton.createButton(renderer);
      holder.replaceChildren(btn);
    } catch (e) {
      console.warn('XR button failed', e);
      showNote(NOTE);
    }
  }
  mountButton();

  // ---------- panel mesh ----------

  const canvas = document.createElement('canvas');
  canvas.width = CW; canvas.height = CH;
  const g = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const panelMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, side: THREE.DoubleSide });
  const panelH = LAYOUT.panelW * (CH / CW);
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(LAYOUT.panelW, panelH), panelMat);
  panel.name = 'xr-panel';
  panel.renderOrder = 999;
  panel.visible = false;

  // reusable temporaries
  const rc = new THREE.Raycaster();
  const m4 = new THREE.Matrix4();
  const vOrigin = new THREE.Vector3();
  const vDir = new THREE.Vector3();
  const vHead = new THREE.Vector3();
  const vFwd = new THREE.Vector3();
  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();

  // ---------- app state readers ----------

  const getView = () => (app.state && app.state.view) || {};
  const getMetrics = () => (app.state && app.state.metrics) || app.metrics || null;
  const getScenario = () => (app.state && app.state.scenario) || {};

  function levelPath() {
    const view = getView(), metrics = getMetrics();
    const title = LEVEL_TITLES[view.level] || String(view.level || '');
    const siteId = view.focus && view.focus.site;
    const site = siteId && metrics && metrics.sites ? metrics.sites[siteId] : null;
    return SITE_BOUND.includes(view.level) && site && site.name ? `${title} / ${site.name}` : title;
  }

  function presetLabel() {
    const list = Array.isArray(app.presets) ? app.presets : [];
    const id = app.state ? app.state.presetId : null;
    const p = list.find((x) => x.id === id);
    return p && p.label ? p.label : 'Custom scenario';
  }

  function yearBounds() {
    const params = app.engine && Array.isArray(app.engine.PARAMS) ? app.engine.PARAMS : [];
    const p = params.find((x) => x.path === 'year');
    return p ? { min: p.min, max: p.max, step: p.step || 1 } : null;
  }

  const wantLife = () => lifeOn && getView().level === 'hall';

  // ---------- panel actions ----------

  function stepYear(dir) {
    const b = yearBounds(), y = Number(getScenario().year);
    if (!b || !Number.isFinite(y) || typeof app.setParam !== 'function') return;
    const next = clamp(y + dir * b.step, b.min, b.max);
    if (next !== y) app.setParam('year', next);
  }

  function stepPreset(dir) {
    const list = Array.isArray(app.presets) ? app.presets : [];
    if (!list.length || typeof app.applyPreset !== 'function') return;
    const id = app.state ? app.state.presetId : null;
    const cur = list.findIndex((p) => p.id === id);
    const next = cur < 0 ? (dir > 0 ? 0 : list.length - 1) : (cur + dir + list.length) % list.length;
    app.applyPreset(list[next].id);
  }

  function press(b) {
    flashId = b.id;
    flashUntil = performance.now() + LAYOUT.flashMs;
    dirty = true;
    try { if (!b.disabled && typeof b.onPress === 'function') b.onPress(); } catch (e) { console.warn('XR panel action failed', e); }
  }

  // ---------- panel drawing ----------

  function drawButton(b) {
    const flashing = b.id === flashId && performance.now() < flashUntil;
    g.save();
    g.globalAlpha = b.disabled ? 0.4 : 1;
    roundRectPath(g, b.x, b.y, b.w, b.h, 16);
    g.fillStyle = flashing ? P.ok : b.active ? P.accent : P.table;
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = b.active ? P.accent : P.tableEdge;
    g.stroke();
    g.fillStyle = flashing || b.active ? '#04121c' : P.ink;
    g.font = `600 30px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(clipText(g, b.label, b.w - 20), b.x + b.w / 2, b.y + b.h / 2 + 1);
    g.restore();
    buttons.push(b);
  }

  function drawCheckBox(metrics) {
    const ff = metrics ? metrics.firstFailing : null;
    const x = 30, y = 72, w = 940, h = 132;
    const flashing = flashId === 'cause' && performance.now() < flashUntil;
    g.save();
    roundRectPath(g, x, y, w, h, 18);
    g.fillStyle = ff ? 'rgba(255,92,108,0.12)' : 'rgba(61,220,151,0.10)';
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = flashing ? P.ok : ff ? P.fail : P.ok;
    g.stroke();
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    if (ff) {
      g.fillStyle = P.fail;
      g.font = `700 32px ${FONT}`;
      g.fillText(clipText(g, `First failing: ${ff.label || ff.id || ''}`, w - 44), x + 22, y + 30);
      g.fillStyle = P.ink;
      g.font = `500 30px ${FONT}`;
      wrapLines(g, ff.msg || '', w - 44, 2).forEach((line, i) => g.fillText(line, x + 22, y + 68 + i * 38));
      const cause = ff.cause;
      if (cause && cause.level) {
        buttons.push({ id: 'cause', x, y, w, h, label: '', disabled: false,
          onPress: () => { if (typeof app.goTo === 'function') app.goTo(cause.level, cause.focus); } });
      }
    } else {
      g.fillStyle = P.ok;
      g.font = `700 32px ${FONT}`;
      g.fillText('All checks pass', x + 22, y + 40);
      g.fillStyle = P.dim;
      g.font = `500 30px ${FONT}`;
      g.fillText(clipText(g, metrics ? 'No constraint is binding in this scenario.' : 'Waiting for the model.', w - 44), x + 22, y + 90);
    }
    g.restore();
  }

  function redraw() {
    dirty = false;
    buttons = [];
    const view = getView(), metrics = getMetrics(), scenario = getScenario();
    g.clearRect(0, 0, CW, CH);

    // card
    roundRectPath(g, 0, 0, CW, CH, 36);
    g.fillStyle = 'rgba(11,15,23,0.94)';
    g.fill();
    g.lineWidth = 4;
    g.strokeStyle = P.tableEdge;
    g.stroke();

    // header: title left, current level right
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.fillStyle = P.ink;
    g.font = `700 34px ${FONT}`;
    const title = 'Rack to the Future';
    g.fillText(title, 36, 38);
    const titleW = g.measureText(title).width;
    g.textAlign = 'right';
    g.fillStyle = P.accent;
    g.font = `600 30px ${FONT}`;
    g.fillText(clipText(g, levelPath(), CW - 72 - titleW - 24), CW - 36, 38);

    // first failing check
    drawCheckBox(metrics);

    // lens row
    const lensW = (940 - 4 * 10) / 5;
    LENSES.forEach((lens, i) => {
      drawButton({ id: `lens:${lens}`, x: 30 + i * (lensW + 10), y: 214, w: lensW, h: 64,
        label: LENS_TITLES[lens] || lens, active: view.lens === lens, disabled: false,
        onPress: () => { if (typeof app.setLens === 'function') app.setLens(lens); } });
    });

    // year row
    const yb = yearBounds(), year = Number(scenario.year);
    const yearOk = !!yb && Number.isFinite(year);
    drawButton({ id: 'year-', x: 30, y: 288, w: 110, h: 64, label: '-', disabled: !yearOk || year <= yb.min, onPress: () => stepYear(-1) });
    drawButton({ id: 'year+', x: 860, y: 288, w: 110, h: 64, label: '+', disabled: !yearOk || year >= yb.max, onPress: () => stepYear(1) });
    g.fillStyle = P.ink;
    g.font = `700 34px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(Number.isFinite(year) ? `Year ${year}` : 'Year', CW / 2, 288 + 33);

    // preset row
    const hasPresets = Array.isArray(app.presets) && app.presets.length > 0;
    drawButton({ id: 'preset-', x: 30, y: 362, w: 150, h: 64, label: 'Prev', disabled: !hasPresets, onPress: () => stepPreset(-1) });
    drawButton({ id: 'preset+', x: 820, y: 362, w: 150, h: 64, label: 'Next', disabled: !hasPresets, onPress: () => stepPreset(1) });
    g.fillStyle = P.ink;
    g.font = `600 30px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(clipText(g, presetLabel(), 620), CW / 2, 362 + 33);

    // bottom row: zoom out, life size, recentre
    drawButton({ id: 'zoomout', x: 30, y: 436, w: 300, h: 64, label: 'Zoom out', disabled: view.level === 'offworld',
      onPress: () => { if (typeof app.zoomOut === 'function') app.zoomOut(); } });
    drawButton({ id: 'life', x: 350, y: 436, w: 300, h: 64, label: lifeOn ? 'Life size: on' : 'Life size: off', active: lifeOn, disabled: false,
      onPress: () => { lifeOn = !lifeOn; dirty = true; } });
    drawButton({ id: 'recentre', x: 670, y: 436, w: 300, h: 64, label: 'Recentre', disabled: false,
      onPress: () => { placePending = true; settle = LAYOUT.settleFrames; } });

    // hint
    g.fillStyle = P.dim;
    g.font = `500 30px ${FONT}`;
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    const hint = lifeOn && view.level !== 'hall'
      ? 'Life size applies at the Hall level.'
      : 'Pinch a button here, or pinch an object on the table to zoom in.';
    wrapLines(g, hint, CW - 60, 2).forEach((line, i) => g.fillText(line, 30, 540 + i * 40));

    tex.needsUpdate = true;
  }

  // ---------- placement and life size ----------

  function tryPlace() {
    const cam = renderer.xr.getCamera ? renderer.xr.getCamera() : null;
    if (!cam || !cam.cameras || cam.cameras.length === 0) return;
    settle += 1;
    if (settle < LAYOUT.settleFrames) return;

    vHead.setFromMatrixPosition(cam.matrixWorld);
    vFwd.set(0, 0, -1).transformDirection(cam.matrixWorld);
    vFwd.y = 0;
    if (vFwd.lengthSq() < 1e-4) vFwd.set(0, 0, -1);
    vFwd.normalize();

    const feats = curSession ? curSession.enabledFeatures : null;
    const floorBased = Array.isArray(feats)
      ? feats.includes('local-floor') || feats.includes('bounded-floor')
      : vHead.y > 0.6;
    const deskY = floorBased ? LAYOUT.deskHeight : vHead.y - LAYOUT.eyeToDesk;

    anchor = {
      head: vHead.clone(),
      dir: vFwd.clone(),
      deskY,
      floorY: deskY - LAYOUT.deskHeight,
      tx: vHead.x + vFwd.x * LAYOUT.tableDistance,
      tz: vHead.z + vFwd.z * LAYOUT.tableDistance,
    };
    table.position.set(anchor.tx, deskY, anchor.tz);
    table.rotation.set(0, Math.atan2(-vFwd.x, -vFwd.z), 0);
    table.scale.setScalar(1);
    lifeT = 0;
    lifeE = 0;
    placePending = false;
    panel.visible = true;
    dirty = true;
  }

  function stepLife(dt) {
    const target = wantLife() ? 1 : 0;
    const step = dt / LAYOUT.lifeSeconds;
    lifeT = target > lifeT ? Math.min(target, lifeT + step) : Math.max(target, lifeT - step);
    lifeE = kit.ease && kit.ease.inOut ? kit.ease.inOut(lifeT) : lifeT;
    table.scale.setScalar(1 + (LAYOUT.lifeScale - 1) * lifeE);
    table.position.y = anchor.deskY + (anchor.floorY - anchor.deskY) * lifeE;
  }

  function updatePanelPose() {
    const a = anchor;
    // behind the table, above the desk
    vA.set(a.head.x + a.dir.x * LAYOUT.panelBehind, a.deskY + LAYOUT.panelAboveDesk, a.head.z + a.dir.z * LAYOUT.panelBehind);
    // in life-size mode: close to the viewer, below the eyes
    vB.set(a.head.x + a.dir.x * LAYOUT.panelNear, a.head.y - LAYOUT.panelNearDrop, a.head.z + a.dir.z * LAYOUT.panelNear);
    panel.position.lerpVectors(vA, vB, lifeE);
    panel.lookAt(a.head);
    panelMat.depthTest = lifeT < 0.02;
  }

  // ---------- input ----------

  function buttonAtUV(uv) {
    if (!uv) return null;
    const x = uv.x * CW, y = (1 - uv.y) * CH;
    for (let i = buttons.length - 1; i >= 0; i--) {
      const b = buttons[i];
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
    }
    return null;
  }

  /** Build the pick ray from the input source pose in the select frame (works for 'transient-pointer' on Vision Pro). */
  function rayFromEvent(event) {
    const xr = renderer.xr;
    const frame = (event && event.frame) || (typeof xr.getFrame === 'function' ? xr.getFrame() : null);
    const source = event ? event.inputSource : null;
    const refSpace = typeof xr.getReferenceSpace === 'function' ? xr.getReferenceSpace() : null;
    let fromPose = false;
    if (frame && source && source.targetRaySpace && refSpace && typeof frame.getPose === 'function') {
      const pose = frame.getPose(source.targetRaySpace, refSpace);
      if (pose && pose.transform) {
        m4.fromArray(pose.transform.matrix);
        vOrigin.setFromMatrixPosition(m4);
        vDir.set(0, 0, -1).transformDirection(m4);
        fromPose = true;
      }
    }
    const cam = typeof xr.getCamera === 'function' ? xr.getCamera() : null;
    if (fromPose) {
      // XR poses are relative to the camera's parent, if it has one.
      const cp = stage.camera && stage.camera.parent;
      if (cp && cp !== stage.scene) {
        cp.updateMatrixWorld();
        vOrigin.applyMatrix4(cp.matrixWorld);
        vDir.transformDirection(cp.matrixWorld);
      }
    } else if (cam) {
      // Fallback: gaze ray from the head.
      vOrigin.setFromMatrixPosition(cam.matrixWorld);
      vDir.set(0, 0, -1).transformDirection(cam.matrixWorld);
    } else {
      return null;
    }
    rc.set(vOrigin, vDir);
    rc.params.Line.threshold = 0.006;  // the default (1 unit) would catch every line on the 1 m table
    rc.params.Points.threshold = 0.01;
    rc.camera = cam || stage.camera;   // sprites (labels) need a camera to be raycast
    return rc;
  }

  function tableIsCloser(ray, distance) {
    if (lifeT > 0.02) return false;   // in life-size mode the panel is drawn on top of the scaled table
    try {
      // Only solid meshes block the panel; grid lines, edges and label sprites do not.
      const hits = ray.intersectObject(table, true).filter((h) => h.object.isMesh && h.object.visible);
      return hits.length > 0 && hits[0].distance < distance;
    } catch (e) {
      return false;
    }
  }

  function handleSelect(event) {
    const ray = rayFromEvent(event);
    if (!ray) return;
    if (panel.visible) {
      panel.updateMatrixWorld(true);
      const hit = ray.intersectObject(panel, false)[0] || null;
      const btn = hit ? buttonAtUV(hit.uv) : null;
      if (btn && !tableIsCloser(ray, hit.distance)) { press(btn); return; }
    }
    const pick = typeof stage.pickFromRay === 'function' ? stage.pickFromRay(ray) : null;
    if (pick && typeof app.zoomIn === 'function') app.zoomIn(pick);
  }

  function onSelect(event) {
    if (!active || disposed) return;
    try { handleSelect(event); } catch (e) { console.warn('XR select failed', e); }
  }

  // ---------- session lifecycle ----------

  function onSessionStart() {
    if (disposed || active) return;
    const session = typeof renderer.xr.getSession === 'function' ? renderer.xr.getSession() : null;
    if (!session) return;
    active = true;
    curSession = session;
    saved = {
      controls: stage.controls ? stage.controls.enabled : null,
      pos: table.position.clone(),
      quat: table.quaternion.clone(),
      scale: table.scale.clone(),
      background: stage.scene.background,
      clearAlpha: typeof renderer.getClearAlpha === 'function' ? renderer.getClearAlpha() : null,
    };
    if (stage.controls) stage.controls.enabled = false;
    // Passthrough (AR): let the real room show through.
    if (session.environmentBlendMode && session.environmentBlendMode !== 'opaque') {
      stage.scene.background = null;
      if (typeof renderer.setClearAlpha === 'function') renderer.setClearAlpha(0);
    }
    session.addEventListener('select', onSelect);
    stage.scene.add(panel);
    panel.visible = false;
    placePending = true;
    settle = 0;
    anchor = null;
    lifeT = 0;
    lifeE = 0;
    dirty = true;
  }

  function onSessionEnd() {
    if (!active) return;
    active = false;
    if (curSession) {
      try { curSession.removeEventListener('select', onSelect); } catch (e) { /* session already gone */ }
      curSession = null;
    }
    stage.scene.remove(panel);
    panel.visible = false;
    if (saved) {
      table.position.copy(saved.pos);
      table.quaternion.copy(saved.quat);
      table.scale.copy(saved.scale);
      stage.scene.background = saved.background;
      if (saved.clearAlpha != null && typeof renderer.setClearAlpha === 'function') renderer.setClearAlpha(saved.clearAlpha);
      if (stage.controls && saved.controls != null) stage.controls.enabled = saved.controls;
    }
    saved = null;
    anchor = null;
    placePending = false;
    lifeT = 0;
    lifeE = 0;
    flashId = null;
    flashUntil = 0;
  }

  renderer.xr.addEventListener('sessionstart', onSessionStart);
  renderer.xr.addEventListener('sessionend', onSessionEnd);

  // ---------- per-frame work ----------

  function onFrame(dt) {
    if (disposed || !active) return;
    const d = Number.isFinite(dt) ? Math.min(Math.max(dt, 0), 0.1) : 0.016;
    if (placePending) tryPlace();
    if (!anchor) return;
    stepLife(d);
    updatePanelPose();
    if (flashUntil && performance.now() >= flashUntil) { flashUntil = 0; flashId = null; dirty = true; }
    if (dirty) redraw();
  }

  if (typeof stage.onFrame === 'function') {
    const off = stage.onFrame(onFrame);
    if (typeof off === 'function') offs.push(off);
  }

  const markDirty = () => { dirty = true; };
  ['change', 'navigate', 'lens', 'preset'].forEach((ev) => {
    if (typeof app.on !== 'function') return;
    const off = app.on(ev, markDirty);
    if (typeof off === 'function') offs.push(off);
  });

  // ---------- dispose ----------

  function dispose() {
    if (disposed) return;
    const session = curSession;
    if (active) {
      onSessionEnd();
      try { if (session) session.end(); } catch (e) { /* already ended */ }
    }
    disposed = true;
    offs.forEach((f) => { try { f(); } catch (e) { /* ignore */ } });
    offs.length = 0;
    try {
      renderer.xr.removeEventListener('sessionstart', onSessionStart);
      renderer.xr.removeEventListener('sessionend', onSessionEnd);
    } catch (e) { /* ignore */ }
    panel.geometry.dispose();
    panelMat.dispose();
    tex.dispose();
    holder.remove();
    const styleEl = slot.querySelector('style');
    if (styleEl) styleEl.remove();
  }

  return { dispose };
}
