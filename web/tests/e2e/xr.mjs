// WebXR test under an emulated headset (IWER, Meta's Immersive Web Emulation Runtime).
// Usage: PLAYWRIGHT_CORE=... CHROME=... IWER=/path/to/iwer/build/iwer.min.js node tests/e2e/xr.mjs
// Checks AC12 as far as an emulator can: the session starts, the table lands at desk height in front of the
// viewer, a controller select on a table object zooms in, panel buttons work, and the session ends cleanly.
// Vision Pro sends 'transient-pointer' selects through the same handler; only a device can confirm that path.

import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = 8146, BASE = `http://127.0.0.1:${PORT}`;
const { chromium } = await import(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const IWER_SRC = readFileSync(process.env.IWER, 'utf8');

const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(700);
const results = [];
const check = (id, ok, detail = '') => { results.push({ id, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${detail}`); };

let browser;
try {
  // GPU=1 renders on the local GPU (ANGLE Metal on a Mac), which keeps the CPU free; the default is software.
  const args = process.env.GPU === '1' ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
  browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
  await page.addInitScript({ content: `${IWER_SRC}\n;window.__iwer = new IWER.XRDevice(IWER.metaQuest3); window.__iwer.installRuntime({ forceInstall: true });` });
  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
  await sleep(1200);

  const btnText = await page.evaluate(() => { const b = document.querySelector('#xr-slot button'); return b ? b.textContent.trim() : null; });
  check('XR button mounted', !!btnText, String(btnText));
  await page.click('#xr-slot button');
  await page.waitForFunction(() => app.stage.renderer.xr.isPresenting === true, null, { timeout: 10000 });
  // Wait for placement instead of a fixed sleep: under load the first XR frames arrive late.
  await page.waitForFunction(() => { const p = app.stage.scene.getObjectByName('xr-panel'); return !!(p && p.visible) && Math.abs(app.stage.table.position.y - 0.8) < 0.05; }, null, { timeout: 15000 }).catch(() => {});

  const place = await page.evaluate(() => {
    const t = app.stage.table, cam = app.stage.renderer.xr.getCamera();
    const head = cam.position.clone ? cam.position : null;
    const panel = app.stage.scene.getObjectByName('xr-panel');
    return { table: t.position.toArray().map((v) => +v.toFixed(3)), head: head ? head.toArray().map((v) => +v.toFixed(3)) : null,
      scale: t.scale.x, panelVisible: !!(panel && panel.visible), controls: app.stage.controls.enabled };
  });
  const dz = place.head ? Math.hypot(place.table[0] - place.head[0], place.table[2] - place.head[2]) : 0;
  check('table at desk height in front of viewer', Math.abs(place.table[1] - 0.8) < 0.05 && dz > 0.4 && dz < 0.8 && place.panelVisible && place.controls === false, JSON.stringify(place));

  // Aim the right controller at a world point and pull the trigger. `until` = [pageFn, arg]: wait for the
  // expected state (up to 8 s) instead of a fixed sleep, so a slow frame loop does not fail the check.
  const aimAndSelect = async (target, until) => {
    await page.evaluate(async (tg) => {
      const THREE = await import('/vendor/three/three.module.js');
      const c = window.__iwer.controllers.right;
      const origin = new THREE.Vector3(0.15, 1.35, -0.1);
      const dir = new THREE.Vector3(tg[0], tg[1], tg[2]).sub(origin).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);
      c.position.set(origin.x, origin.y, origin.z);
      c.quaternion.set(q.x, q.y, q.z, q.w);
    }, target);
    await sleep(250);
    await page.evaluate(() => window.__iwer.controllers.right.updateButtonValue('trigger', 1));
    await sleep(250);
    await page.evaluate(() => window.__iwer.controllers.right.updateButtonValue('trigger', 0));
    if (until) await page.waitForFunction(until[0], until[1], { timeout: 8000 }).catch(() => {});
    else await sleep(900);
  };
  const worldOfFirstPickable = () => page.evaluate(async () => {
    const THREE = await import('/vendor/three/three.module.js');
    const a = app.activeLevel(), objs = a.pickables();
    if (!objs.length) return null;
    const o = objs[0];
    o.updateMatrixWorld(true);
    let p;
    if (o.isInstancedMesh) { const m = new THREE.Matrix4(); o.getMatrixAt(0, m); p = new THREE.Vector3(0, 0.5, 0).applyMatrix4(m).applyMatrix4(o.matrixWorld); }
    else { p = new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3()); }
    return p.toArray();
  });

  // Pinch-to-zoom on the table: building -> hall
  await page.evaluate(() => app.goTo('building', { site: 'wtx' })); await sleep(900);
  const target = await worldOfFirstPickable();
  if (target) await aimAndSelect(target, [() => app.state.view.level === 'hall']);
  const afterPick = await page.evaluate(() => app.state.view.level);
  check('select on a table object zooms in', target && afterPick === 'hall', `target=${JSON.stringify(target && target.map((v) => +v.toFixed(3)))} level=${afterPick}`);

  // Panel button: zoom out (canvas rect x 30..330, y 436..500 on a 1000 x 640 canvas)
  const panelPoint = (cx, cy) => page.evaluate(async ([x, y]) => {
    const THREE = await import('/vendor/three/three.module.js');
    const p = app.stage.scene.getObjectByName('xr-panel'); p.updateMatrixWorld(true);
    const w = p.geometry.parameters.width, h = p.geometry.parameters.height;
    return p.localToWorld(new THREE.Vector3((x / 1000 - 0.5) * w, (0.5 - y / 640) * h, 0)).toArray();
  }, [cx, cy]);
  const levelBefore = await page.evaluate(() => app.state.view.level);
  await aimAndSelect(await panelPoint(180, 468), [() => app.state.view.level === 'building']);
  const levelAfter = await page.evaluate(() => app.state.view.level);
  check('panel zoom out button', levelBefore === 'hall' && levelAfter === 'building', `${levelBefore} -> ${levelAfter}`);

  // Panel lens button: Heat is the first lens button (x 30..206, y 214..278)
  await aimAndSelect(await panelPoint(118, 246), [() => app.state.view.lens === 'heat']);
  const lens = await page.evaluate(() => app.state.view.lens);
  check('panel lens button', lens === 'heat', lens);

  // Panel year minus (x 30..140, y 288..352)
  const y0 = await page.evaluate(() => app.state.scenario.year);
  await aimAndSelect(await panelPoint(85, 320), [(y) => app.state.scenario.year === y - 1, y0]);
  const y1 = await page.evaluate(() => app.state.scenario.year);
  check('panel year button', y1 === y0 - 1, `${y0} -> ${y1}`);

  // Panel preset Next (x 820..970, y 362..426)
  const p0 = await page.evaluate(() => app.state.presetId);
  await aimAndSelect(await panelPoint(895, 394), [(p) => !!app.state.presetId && app.state.presetId !== p, p0]);
  const p1 = await page.evaluate(() => app.state.presetId);
  check('panel preset button', p1 && p1 !== p0, `${p0} -> ${p1}`);

  // Life size at the hall level (x 350..650, y 436..500): the table scales up and drops to the floor, then back.
  await page.evaluate(() => app.goTo('hall', { site: 'wtx' })); await sleep(900);
  await aimAndSelect(await panelPoint(500, 468), [() => Math.abs(app.stage.table.scale.x - 25) < 0.02 && Math.abs(app.stage.table.position.y) < 0.02]);
  const lifeOn = await page.evaluate(() => ({ s: +app.stage.table.scale.x.toFixed(2), y: +app.stage.table.position.y.toFixed(3) }));
  await aimAndSelect(await panelPoint(500, 468), [() => Math.abs(app.stage.table.scale.x - 1) < 0.005 && Math.abs(app.stage.table.position.y - 0.8) < 0.02]);
  const lifeOff = await page.evaluate(() => ({ s: +app.stage.table.scale.x.toFixed(2), y: +app.stage.table.position.y.toFixed(3) }));
  check('panel life size toggle', Math.abs(lifeOn.s - 25) < 0.5 && Math.abs(lifeOn.y) < 0.05 && Math.abs(lifeOff.s - 1) < 0.01 && Math.abs(lifeOff.y - 0.8) < 0.05,
    `on ${JSON.stringify(lifeOn)} off ${JSON.stringify(lifeOff)}`);

  await page.evaluate(() => app.stage.renderer.xr.getSession().end());
  await page.waitForFunction(() => !app.stage.renderer.xr.isPresenting && app.stage.controls.enabled, null, { timeout: 8000 }).catch(() => {});
  await sleep(300);
  const end = await page.evaluate(() => ({ presenting: app.stage.renderer.xr.isPresenting, table: app.stage.table.position.toArray(), controls: app.stage.controls.enabled }));
  check('session ends and restores the desktop view', !end.presenting && end.table.every((v) => Math.abs(v) < 1e-6) && end.controls, JSON.stringify(end));
  const fatal = errors.filter((e) => /pageerror|TypeError|ReferenceError|XR select failed|XR panel action failed/.test(e) || !/warning/.test(e)).filter((e) => !/cleanview-markers|Failed to load resource|favicon/.test(e));
  check('no XR errors', fatal.length === 0, fatal.slice(0, 4).join(' || '));
} catch (e) {
  check('harness', false, e.stack || String(e));
} finally {
  if (browser) await browser.close();
  server.kill();
}
const failed = results.filter((r) => !r.ok);
mkdirSync(join(ROOT, 'test-results'), { recursive: true });
writeFileSync(join(ROOT, 'test-results', 'xr.json'), JSON.stringify({ device: 'IWER metaQuest3 (emulated)', results }, null, 1));
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
