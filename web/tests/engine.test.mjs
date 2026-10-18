// Engine tests against the slide and spec numbers. Run: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/engine/engine.js';
import { CATALOG as C } from '../src/data/catalog.js';
import { npv, irr, paybackYears } from '../src/engine/finance.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tol ${tol})`);
const caseOnly = (id) => E.applyParam(E.defaultScenario(), 'caseMix', { A: 0, B: 0, C: 0, [id]: 1 });

test('slide 11: peak tokens per user reproduce from the slide 10 workloads and slide 17 peaks', () => {
  for (const [id, out, inp] of [['A', 2.4, 5.6], ['B', 28, 333], ['C', 4.6, 40]]) {
    const d = E.demand(caseOnly(id)), users = C.cases[id].users;
    near(d.outTokS / users, out, out * 0.03, `case ${id} out`);
    near(d.inTokS / users, inp, inp * 0.03, `case ${id} in`);
  }
});

test('slide 11: reads per user per day reproduce', () => {
  for (const id of ['A', 'B', 'C']) {
    const d = E.demand(caseOnly(id)), users = C.cases[id].users;
    near((d.dailyIn + d.dailyCached) / users, C.cases[id].readsPerUserDay, C.cases[id].readsPerUserDay * 0.02, `case ${id} reads (slide rounds to 2 figures)`);
  }
});

test('Case B sizing: 965 prefill and 825 decode 2035 GPU racks, about 1.4 GW of IT', () => {
  const n = E.neededRacks(E.defaultScenario());
  assert.equal(n.prefillRacks, 965); assert.equal(n.decodeRacks, 825);
  const m = E.derive(E.defaultScenario());
  near(m.totals.itMW, 1418, 2, 'IT MW');
});

test('spec worked example: 500 MW of 792 kW racks is about 631 racks and $15.0B of hardware', () => {
  const racks = Math.floor(500 / (C.racks.gpu.kW / 1000));
  assert.equal(racks, 631);
  near(racks * C.racks.gpu.costUSD / 1e9, 15.0, 0.05, 'hardware $B');
});

test('start preset fits the grid, fits the budget, and fails on serving first', () => {
  const m = E.derive(E.PRESETS['fit-grid'].make());
  assert.ok(m.totals.earthFacilityMW <= 500 + 1e-6, `facility ${m.totals.earthFacilityMW}`);
  assert.ok(m.totals.cost5yrUSD <= 30e9);
  assert.equal(m.firstFailing.id, 'serving');
});

test('all of Case B on Earth fails the grid first', () => {
  const m = E.derive(E.PRESETS['challenge-b'].make());
  assert.equal(m.firstFailing.id, 'grid');
  assert.ok(m.totals.earthFacilityMW > 500);
});

test('LPU decode serves more of the same 500 MW at fewer joules per token', () => {
  const g = E.derive(E.PRESETS['fit-grid'].make()), l = E.derive(E.PRESETS['lpu-decode'].make());
  assert.ok(l.totals.served.overall > g.totals.served.overall);
  assert.ok(l.totals.jPerOutputToken < g.totals.jPerOutputToken);
});

test('orbit takes the overflow and keeps Earth under the cap', () => {
  const m = E.derive(E.PRESETS['lpu-orbit'].make());
  assert.ok(m.totals.offworldITMW > 0);
  assert.ok(m.totals.earthFacilityMW <= 500 + 1e-6);
  assert.ok(m.totals.launchUSD > 0);
});

test('year slider: 2025 is the GB200 NVL72 and joules per token fall every year to 2035', () => {
  const r = E.racksForYear(2025).gpu;
  assert.equal(r.kW, 132); assert.equal(r.chips, 72); assert.equal(r.costUSD, 4e6);
  const ys = E.projectYears(E.defaultScenario());
  for (let i = 1; i < ys.length; i++) assert.ok(ys[i].jPerOutputToken < ys[i - 1].jPerOutputToken, `J/token ${ys[i].year}`);
  const r35 = E.racksForYear(2035).gpu;
  near(r35.kW, 792, 1e-6, '2035 kW'); near(r35.decodeAgentTokPerChip, 11700, 1e-6, '2035 decode');
});

test('LPU and air racks are not available before 2030', () => {
  assert.equal(E.racksForYear(2029).lpu.available, false);
  assert.equal(E.racksForYear(2030).lpu.available, true);
});

test('PUE follows slide 15 cold and desert columns', () => {
  const m = E.derive(E.defaultScenario());
  near(m.sites.iceland.pue, C.cooling.dlc.pueCold, 1e-9, 'Iceland dlc cold');
  near(m.sites.gulf.pue, C.cooling.dlc.pueDesert, 1e-9, 'Gulf dlc desert');
});

test('cooling check: 792 kW racks cannot be air cooled', () => {
  const m = E.derive(E.applyParam(E.PRESETS['fit-grid'].make(), 'sites.wtx.cooling', 'airChillers'));
  const c = m.checks.find((x) => x.id === 'cooling');
  assert.equal(c.ok, false);
  assert.equal(c.cause.level, 'hall');
});

test('water check: evaporative cooling in a desert climate fails', () => {
  let s = E.PRESETS['fit-grid'].make();
  s = E.applyParam(E.applyParam(s, 'sites.gulf.cooling', 'airEvap'), 'pools.prefill.type', 'air');
  const m = E.derive(s);
  assert.equal(m.checks.find((x) => x.id === 'water').ok, false);
  assert.ok(m.sites.gulf.waterMLPerYear > 0);
});

test('latency check: racks only on the Moon cannot serve interactive work', () => {
  let s = E.defaultScenario();
  for (const id of Object.keys(s.sites)) s = E.applyParam(s, `sites.${id}.enabled`, false);
  s = E.applyParam(s, 'offworld.moon.enabled', true);
  const m = E.derive(s);
  assert.ok(m.sites.moon.racks.decode > 0);
  assert.equal(m.totals.served.interactive, 0);
  assert.equal(m.checks.find((x) => x.id === 'latency').ok, false);
});

test('finance: NPV, IRR and payback basics; break-even revenue gives NPV zero', () => {
  near(npv(0.1, [-100, 110]), 0, 1e-9, 'npv');
  near(irr([-100, 110]), 0.1, 1e-6, 'irr');
  near(paybackYears([-100, 50, 50, 50]), 2, 1e-9, 'payback');
  assert.equal(irr([-100, -5, -5]), null);
  const m = E.derive(E.PRESETS['fit-grid'].make()), F = m.finance;
  const cf = [-F.capexUSD, ...Array(5).fill(F.breakevenRevenueUSDPerYear - F.opexUSDPerYear)];
  near(npv(F.discountRate, cf), 0, 1, 'break-even NPV');
});

test('money flows balance: inflows to spend equal outflows from spend', () => {
  const m = E.derive(E.PRESETS['fit-grid'].make());
  const into = m.money.links.filter((l) => l.target === 'spend').reduce((a, l) => a + l.usd, 0);
  const out = m.money.links.filter((l) => l.source === 'spend').reduce((a, l) => a + l.usd, 0);
  near(into, out, 1, 'spend balance');
});

test('checks come back in the frozen order', () => {
  const m = E.derive(E.defaultScenario());
  assert.deepEqual(m.checks.map((c) => c.id), ['grid', 'budget', 'serving', 'cooling', 'latency', 'water']);
});

test('every preset derives without throwing and has finite totals', () => {
  for (const [id, p] of Object.entries(E.PRESETS)) {
    const m = E.derive(p.make());
    for (const k of ['itMW', 'facilityMW', 'cost5yrUSD']) assert.ok(Number.isFinite(m.totals[k]), `${id} ${k}`);
  }
});
