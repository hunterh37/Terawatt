// Guided tour: the demo story in about a minute. Every line is built from live engine metrics.

import { fmt } from './ui/common.js';
import { sizePools, derive } from './engine/engine.js';

const HOLD = 6500;

export function createTour(app) {
  let token = 0;
  const tour = { running: false, start, stop };

  const wait = (ms, my) => new Promise((resolve, reject) => setTimeout(() => (my === token ? resolve() : reject(new Error('stopped'))), ms));
  const m = () => app.metrics;
  const say = (text) => app.toast(text, HOLD - 300);

  const STEPS = [
    async () => {
      app.applyPreset('fit-grid'); await app.goTo('fleet'); app.setLens('power');
      const T = m().totals, full = derive(sizePools(app.state.scenario)).totals;
      say(`Case B: ${fmt.short(T.demand.users)} agent developers in 2035. Serving all of them takes ${fmt.mw(full.itMW)} of IT; Earth's grid gives ${fmt.mw(T.gridCapMW)}. We serve ${fmt.pct(T.served.overall)}.`);
    },
    async () => {
      await app.goTo('site', { site: 'wtx' });
      const s = m().sites.wtx;
      say(`West Texas gets ${fmt.mw(s.facilityMW)}: a ghost building sized to its share of the grid, PUE ${s.pue.toFixed(2)} with ${app.catalog.cooling[s.cooling].label.toLowerCase()} cooling.`);
    },
    async () => {
      await app.goTo('hall', { site: 'wtx', hall: '0' });
      const s = m().sites.wtx;
      say(`Inside: ${s.halls} halls of up to ${app.catalog.facility.hallRacks} racks. Orange racks read your prompt (prefill), blue racks write the answer (decode).`);
    },
    async () => {
      await app.goTo('rack', { rack: 'decode' });
      const r = m().racksForYear[app.state.scenario.pools.decode.type];
      say(`One ${r.label}: ${fmt.kw(r.kW)}, ${r.chips} chips, ${fmt.usd(r.costUSD)}.`);
    },
    async () => {
      await app.goTo('chip'); app.setLens('heat');
      const c = m().chip;
      say(`One package: ${fmt.kw(c.kW)} through ${fmt.num(c.dieAreaMM2)} mm2 of compute silicon, about ${fmt.num(c.heatFluxWPerCm2)} W per cm2. Air cannot cool that.`);
    },
    async () => {
      app.applyPreset('lpu-decode'); await app.goTo('fleet'); app.setLens('power');
      const T = m().totals;
      say(`Swap decode to LPU racks: the same 500 MW now serves ${fmt.pct(T.served.overall)}, and energy per output token falls to ${fmt.j(T.jPerOutputToken)}.`);
    },
    async () => {
      app.applyPreset('lpu-orbit'); await app.goTo('offworld');
      const T = m().totals;
      say(`When the grid runs out, overflow goes to orbit: ${fmt.mw(T.offworldITMW)} of compute and ${fmt.usd(T.launchUSD)} of launches. The Moon is 2.6 s away, so it only gets background work.`);
    },
    async () => {
      await app.goTo('fleet'); app.setLens('cost');
      const F = m().finance, ff = m().firstFailing;
      say(`Break-even: ${fmt.usd(F.breakevenUSDPerUserMonth)} per developer per month over five years, beside $20 consumer plans. First failing check: ${ff ? ff.label : 'none'}.`);
    },
    async () => {
      app.applyPreset('today-2025');
      const T = m().totals;
      say(`The same demand on 2025 racks needs ${fmt.num(T.racks.total)} racks and ${fmt.mw(T.earthFacilityMW)}. That is the gap 2035 hardware has to close.`);
    },
  ];

  async function start() {
    const my = ++token; tour.running = true;
    try {
      for (const step of STEPS) { if (my !== token) break; await step(); await wait(HOLD, my); }
      if (my === token) { app.applyPreset('fit-grid'); await app.goTo('fleet'); app.setLens('power'); app.toast('Tour done. Now move the sliders.'); }
    } catch (e) { if (e.message !== 'stopped') console.error('[tour]', e); }
    finally { if (my === token) tour.running = false; }
  }
  function stop() { token++; tour.running = false; app.toast('Tour stopped'); }
  return tour;
}
