// Browser smoke test for the acceptance criteria that a headless browser can check.
// Usage: PLAYWRIGHT_CORE=/path/to/playwright-core CHROME=/path/to/chrome-headless-shell node tests/e2e/smoke.mjs [--shots]
// Starts a static server on 127.0.0.1:8145, runs the checks, writes test-results/e2e.json, exits non-zero on failure.

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = 8145, BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = process.argv.includes('--shots');
const { chromium } = await import(process.env.PLAYWRIGHT_CORE || 'playwright-core');

const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(700);

const results = [], errors = [];
const check = (id, ok, detail = '') => { results.push({ id, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${detail}`); };

let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROME || undefined,
    // GPU=1 renders on the local GPU (ANGLE Metal on a Mac), which keeps the CPU free; the default is software.
    args: process.env.GPU === '1' ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
  await sleep(800);
  if (SHOTS) mkdirSync(join(ROOT, 'docs', 'shots'), { recursive: true });
  const shot = async (name) => { if (SHOTS) await page.screenshot({ path: join(ROOT, 'docs', 'shots', `${name}.png`) }); };

  const ev = (fn, arg) => page.evaluate(fn, arg);
  const settle = () => sleep(650);

  // Boot state
  const boot = await ev(() => ({ level: app.state.view.level, preset: app.state.presetId, ff: app.metrics.firstFailing && app.metrics.firstFailing.id }));
  check('boot', boot.level === 'fleet' && boot.preset === 'fit-grid', JSON.stringify(boot));
  await shot('01-fleet');

  // Every level mounts with a caption and sourced readout rows
  const levelInfo = {};
  for (const lv of ['offworld', 'fleet', 'site', 'building', 'hall', 'rack', 'chip']) {
    await ev((l) => app.goTo(l, l === 'site' ? { site: 'wtx' } : {}), lv); await settle();
    const info = await ev(() => {
      const a = app.activeLevel();
      const ro = a && a.readout ? a.readout(app.state, app.metrics) : [];
      const lg = a && a.legend ? a.legend(app.state.view.lens, app.state, app.metrics) : null;
      return { level: app.state.view.level, caption: a && a.caption ? a.caption(app.state, app.metrics) : '', rows: ro.length,
        unsourced: ro.filter((r) => !r.sourceId || !app.sources[r.sourceId]).map((r) => r.label), legend: lg && lg.title,
        placeholder: /did not load|unavailable/.test(a && a.caption ? a.caption(app.state, app.metrics) : ''),
        pickables: a && a.pickables ? a.pickables().length : 0 };
    });
    levelInfo[lv] = info;
    check(`level:${lv}`, info.level === lv && !info.placeholder && info.caption && info.rows > 0 && info.unsourced.length === 0,
      `rows=${info.rows} picks=${info.pickables} unsourced=${info.unsourced.join('|')} caption="${String(info.caption).slice(0, 90)}"`);
    await shot(`lv-${lv}`);
  }

  // AC1 zoom in via a pick, breadcrumb names the site
  await ev(() => app.goTo('fleet')); await settle();
  await ev(() => app.zoomIn({ level: 'site', id: 'wtx', label: 'West Texas' })); await settle();
  const crumb = await ev(() => document.getElementById('breadcrumb').textContent.replace(/\s+/g, ' '));
  check('AC1 zoom in', /Earth fleet/.test(crumb) && /West Texas/.test(crumb), crumb.slice(0, 120));

  // AC2 zoom out one level
  await ev(() => app.zoomOut()); await settle();
  check('AC2 zoom out', (await ev(() => app.state.view.level)) === 'fleet');

  // AC3 off-world path skips building and hall
  await ev(() => app.goTo('offworld')); await settle();
  await ev(() => app.zoomIn({ level: 'site', id: 'leo' })); await settle();
  await ev(() => app.zoomIn({ level: 'building', id: '0' })); await settle();
  const ac3 = await ev(() => app.state.view.level);
  await ev(() => app.zoomOut()); await settle();
  const ac3b = await ev(() => app.state.view.level);
  check('AC3 off-world path', ac3 === 'rack' && ac3b === 'site', `${ac3} then ${ac3b}`);

  // Colour signature of everything the active level draws, to prove a lens really recolours objects.
  const colourSig = () => ev(() => {
    let h = 7;
    const add = (v) => { h = (h * 31 + Math.round(v * 1000)) % 1000000007; };
    app.activeLevel().group.traverse((o) => {
      for (const m of [].concat(o.material || [])) if (m && m.color) { add(m.color.r); add(m.color.g); add(m.color.b); }
      if (o.instanceColor) for (const v of o.instanceColor.array) add(v);
      const c = o.geometry && o.geometry.attributes && o.geometry.attributes.color;
      if (c) for (const v of c.array) add(v);
    });
    return h;
  });

  // AC4 lenses recolour without moving the camera
  await ev(() => app.goTo('fleet', { site: 'wtx' })); await settle();
  const cam0 = await ev(() => app.stage.camera.position.toArray().map((x) => x.toFixed(3)).join(','));
  const legends = [];
  const colours = [];
  for (const l of ['heat', 'power', 'cost', 'sentiment', 'water']) { await ev((x) => app.setLens(x), l); await sleep(150); legends.push(await ev(() => { const a = app.activeLevel(); const g = a.legend(app.state.view.lens, app.state, app.metrics); return `${g.title}:${g.items.length}`; })); colours.push(await colourSig()); }
  const cam1 = await ev(() => app.stage.camera.position.toArray().map((x) => x.toFixed(3)).join(','));
  const cardText = await ev(() => document.getElementById('level-card').textContent);
  check('AC4 lenses', new Set(legends).size >= 4 && new Set(colours).size >= 4 && cam0 === cam1 && cardText.length > 20, `${legends.join(' ')} | distinct colour states ${new Set(colours).size} of 5`);
  await ev(() => app.setLens('power'));

  // AC5 year slider to 2025
  const j35 = await ev(() => app.metrics.totals.jPerOutputToken);
  await ev(() => app.setParam('year', 2025)); await settle();
  const y25 = await ev(() => ({ kW: app.metrics.racksForYear.gpu.kW, chips: app.metrics.racksForYear.gpu.chips, j: app.metrics.totals.jPerOutputToken, label: app.metrics.racksForYear.gpu.label }));
  check('AC5 year slider', y25.kW === 132 && y25.chips === 72 && y25.j > j35, JSON.stringify(y25));
  await shot('03-year-2025');

  // AC6 first failing banner and tap to cause
  await ev(() => app.applyPreset('fit-grid')); await ev(() => app.goTo('fleet')); await settle();
  const banner = await ev(() => document.getElementById('constraint-banner').textContent.replace(/\s+/g, ' '));
  const cause = await ev(() => app.metrics.firstFailing.cause.level);
  const clicked = await ev(() => {
    const root = document.getElementById('constraint-banner');
    const cands = [...root.querySelectorAll('button, [role="button"], a, [tabindex]')];
    const t = cands.find((x) => /serving/i.test(x.textContent)) || cands.find((x) => /fail/.test(x.className)) || null;
    if (t) t.click();
    return !!t;
  });
  await settle();
  const afterTap = await ev(() => app.state.view.level);
  check('AC6 first failing', /Serving/i.test(banner) && clicked && afterTap === cause, `banner="${banner.slice(0, 100)}" cause=${cause} after=${afterTap}`);

  // AC7 grid binds on all-of-Case-B
  await ev(() => app.applyPreset('challenge-b')); await settle();
  const ac7 = await ev(() => ({ ff: app.metrics.firstFailing.id, mw: app.metrics.totals.earthFacilityMW }));
  check('AC7 grid binds', ac7.ff === 'grid' && ac7.mw > 500, JSON.stringify(ac7));
  await ev(() => app.applyPreset('fit-grid')); await ev(() => app.goTo('fleet')); await settle();

  // AC8 source popover from a badge
  const pop = await ev(async () => {
    const b = document.querySelector('#level-card .src-badge, #panel-business .src-badge, #panel-scenario .src-badge');
    if (!b) return { found: false };
    b.click(); await new Promise((r) => setTimeout(r, 100));
    const p = document.getElementById('src-pop');
    return { found: true, open: p && !p.hidden, text: p ? p.textContent.slice(0, 120) : '' };
  });
  check('AC8 source popover', pop.found && pop.open && pop.text.length > 10, JSON.stringify(pop));
  await page.keyboard.press('Escape');

  // AC9 business case and a live price change
  const biz = await ev(() => document.getElementById('panel-business').textContent.replace(/\s+/g, ' '));
  const npv0 = await ev(() => app.metrics.finance.npvUSD);
  await ev(() => app.setParam('finance.subUSDPerUserMonth', 100)); await settle();
  const npv1 = await ev(() => app.metrics.finance.npvUSD);
  const biz2 = await ev(() => document.getElementById('panel-business').textContent.replace(/\s+/g, ' '));
  const hasSankey = await ev(() => !!document.querySelector('#panel-business svg'));
  check('AC9 business case', /NPV/.test(biz) && /IRR/.test(biz) && /[Pp]ayback/.test(biz) && /[Bb]reak-even/.test(biz) && npv1 > npv0 && biz2 !== biz && hasSankey,
    `npv ${Math.round(npv0 / 1e9)}B -> ${Math.round(npv1 / 1e9)}B`);
  await shot('02-business');
  await ev(() => app.applyPreset('fit-grid')); await settle();

  // AC10 projection chart
  const svgCount = await ev(() => document.querySelectorAll('#panel-business svg').length);
  check('AC10 projection chart', svgCount >= 2 && /2025/.test(biz) && /2035/.test(biz), `svgs=${svgCount}`);

  // AC11 Cleanview credit and existing campuses
  await ev(() => app.goTo('fleet')); await settle();
  const cv = await ev(() => ({ link: !!document.querySelector('#panel-business a[href*="cleanview.co"]'), text: /Cleanview/.test(document.getElementById('panel-business').textContent),
    campuses: (app.data.existingDCs || []).length, campusRow: /Known AI campuses/.test(document.getElementById('level-card').textContent),
    abilene: (app.data.existingDCs || []).some((d) => /Abilene/i.test(d.name) && /^https:\/\//.test(d.url || '')) }));
  check('AC11 existing data centers', cv.link && cv.text && cv.campuses > 0 && cv.campusRow && cv.abilene, JSON.stringify(cv));

  // AC14 chip workbench responds to dies
  await ev(() => app.goTo('chip')); await settle();
  const c0 = await ev(() => ({ kW: app.metrics.chip.kW, flux: app.metrics.chip.heatFluxWPerCm2 }));
  await ev(() => app.setLens('heat')); await settle();
  const h0 = await colourSig();
  await ev(() => app.setParam('chipLab.dies', 6)); await settle();
  const c1 = await ev(() => ({ kW: app.metrics.chip.kW, flux: app.metrics.chip.heatFluxWPerCm2 }));
  const h1 = await colourSig();
  await ev(() => app.setParam('chipLab.dies', 4)); await ev(() => app.setParam('chipLab.hbm', 8)); await settle();
  const c2 = await ev(() => ({ kW: app.metrics.chip.kW, flux: app.metrics.chip.heatFluxWPerCm2 }));
  check('AC14 chip workbench', c1.kW > c0.kW && c1.flux !== c0.flux && c2.flux !== c0.flux && h1 !== h0,
    `dies 4 -> 6: ${c0.kW.toFixed(2)} -> ${c1.kW.toFixed(2)} kW, flux ${Math.round(c0.flux)} -> ${Math.round(c1.flux)}; HBM 8: flux ${Math.round(c2.flux)} (chip ${c2.kW.toFixed(2)} kW); heat lens recoloured ${h1 !== h0}`);
  await ev(() => app.setParam('chipLab.hbm', 4)); await ev(() => app.setLens('power'));

  // Level card shows the matching RealityHD render at chip, rack and off-world, and the image loads
  const picAt = async (level, focus, want) => {
    await ev(([l, f]) => app.goTo(l, f), [level, focus]); await settle();
    await page.waitForFunction((w) => { const i = document.querySelector('#level-card .lc-pic img');
      return w ? !!(i && i.getAttribute('src').endsWith(w) && i.complete && i.naturalWidth > 0) : !i; }, want, { timeout: 8000 }).catch(() => {});
    return ev(() => { const i = document.querySelector('#level-card .lc-pic img'); return i ? `${i.getAttribute('src').split('/').pop()}:${i.naturalWidth}` : `none@${app.state.view.level}`; });
  };
  const pics = [await picAt('chip', {}, 'chip-package-final.jpg'), await picAt('rack', { site: 'wtx', rack: 'decode' }, 'rack-ai-1mw.jpg'),
    await picAt('offworld', {}, 'orbital-dc-module.jpg'), await picAt('hall', { site: 'wtx' }, null)];
  check('level card renders', pics[0] === 'chip-package-final.jpg:640' && pics[1] === 'rack-ai-1mw.jpg:640' && pics[2] === 'orbital-dc-module.jpg:640' && pics[3] === 'none@hall', pics.join(' '));

  // Tour runs its first step
  await ev(() => app.goTo('fleet')); await settle();
  await ev(() => { app.tour.start(); }); await sleep(1500);
  const toast = await ev(() => document.getElementById('toast').textContent);
  await ev(() => app.tour.stop());
  check('tour', /Case B/.test(toast), toast.slice(0, 120));

  // PRD page renders its sections
  const prd = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  prd.on('pageerror', (e) => errors.push(`prd pageerror: ${e.message}`));
  await prd.goto(`${BASE}/prd/index.html`, { waitUntil: 'load' }); await sleep(1500);
  const prdInfo = await prd.evaluate(() => ({ s: !!document.getElementById('situation'), t: !!document.getElementById('task'), a: !!document.getElementById('action'),
    r: !!document.getElementById('result'), imgs: document.images.length, broken: [...document.images].filter((i) => !i.naturalWidth).map((i) => i.getAttribute('src')),
    missingSrc: [...document.querySelectorAll('.num-missing')].map((n) => n.dataset.src) }));
  check('PRD renders', prdInfo.s && prdInfo.t && prdInfo.a && prdInfo.imgs >= 6 && prdInfo.broken.length === 0 && prdInfo.missingSrc.length === 0, JSON.stringify(prdInfo));
  if (SHOTS) await prd.screenshot({ path: join(ROOT, 'docs', 'shots', 'prd.png') });

  const fatal = errors.filter((e) => !/favicon|cleanview-markers|404 \(File not found\)|Failed to load resource/.test(e));
  check('no console errors', fatal.length === 0, fatal.slice(0, 5).join(' || '));
  mkdirSync(join(ROOT, 'test-results'), { recursive: true });
  writeFileSync(join(ROOT, 'test-results', 'e2e.json'), JSON.stringify({ results, errors, levelInfo }, null, 1));
} catch (e) {
  check('harness', false, e.stack || String(e));
} finally {
  if (browser) await browser.close();
  server.kill();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
