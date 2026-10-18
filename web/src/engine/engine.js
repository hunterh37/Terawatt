// Scenario engine: one pure function from a scenario to every number the app draws.
// No DOM, no three.js. Tested in tests/engine.test.mjs against the spec and slide numbers.

import { CATALOG as C } from '../data/catalog.js';
import { SITE_IDS, CHECK_ORDER, OFFWORLD_KINDS } from '../contract.js';
import { npv, irr, paybackYears } from './finance.js';

const DAY_S = 86400;
const HOURS_YEAR = 8760;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerpLog = (a, b, t) => (t <= 0 ? a : t >= 1 ? b : a > 0 && b > 0 ? a * Math.pow(b / a, t) : a + (b - a) * t);
const clone = (o) => JSON.parse(JSON.stringify(o));

// ---------- rack catalog for a given year ----------

/** Geometric interpolation of a GPU-line field between the anchors that define it. */
function gpuLineField(year, field) {
  const pts = C.gpuLine.filter((p) => p[field] !== undefined);
  if (year <= pts[0].year) return pts[0][field];
  for (let i = 1; i < pts.length; i++) {
    if (year <= pts[i].year) {
      const a = pts[i - 1], b = pts[i];
      return lerpLog(a[field], b[field], (year - a.year) / (b.year - a.year));
    }
  }
  return pts[pts.length - 1][field];
}

export function racksForYear(year) {
  const y = clamp(Math.round(year), 2025, 2035);
  const g = C.racks.gpu;
  const chatRatio = g.decodeChatTokPerChip / g.decodeAgentTokPerChip;
  // Rack power and chip count follow the 2025 / 2027 / 2035 anchors. Price per kW and tokens/s per
  // chip-kW (tokens per joule) are interpolated between 2025 and 2035, so a hotter rack is never slower per watt.
  const kW = gpuLineField(y, 'kW'), chips = Math.round(gpuLineField(y, 'chips')), kWPerChip = kW / chips;
  const g25 = C.gpuLine[0], g35 = C.gpuLine[C.gpuLine.length - 1], t = (y - g25.year) / (g35.year - g25.year);
  const perKW = (f) => lerpLog(g25[f] / g25.kW, g35[f] / g35.kW, t);
  const perChipKW = (f) => lerpLog(g25[f] / (g25.kW / g25.chips), g35[f] / (g35.kW / g35.chips), t);
  const gpu = {
    ...g,
    year: y,
    label: y === 2025 ? 'GB200 NVL72' : y === 2035 ? 'GPU rack' : `GPU rack (${y}, interpolated)`,
    kW,
    chips,
    costUSD: perKW('costUSD') * kW,
    decodeAgentTokPerChip: perChipKW('decodeAgentTokPerChip') * kWPerChip,
    prefillTokPerChip: perChipKW('prefillTokPerChip') * kWPerChip,
    available: true,
  };
  gpu.decodeChatTokPerChip = gpu.decodeAgentTokPerChip * chatRatio;
  const newOk = y >= C.newRackYear;
  const out = { gpu };
  for (const t of ['lpu', 'air']) out[t] = newOk ? { ...C.racks[t], available: true } : { ...gpu, id: t, available: false, label: `${C.racks[t].label} (not yet available, GPU rack used)` };
  out.nvl72 = { ...C.racks.nvl72, available: true };
  for (const [k, r] of Object.entries(out)) { r.id = k; r.kWPerChip = (r.kW / r.chips); }
  return out;
}

// ---------- demand ----------

function perUserDaily(caseId) {
  const k = C.cases[caseId], w = C.workloads;
  let out = 0, inNew = 0, cached = 0, peakOutI = 0, peakOutB = 0, peakInI = 0, peakInB = 0, tasks = 0, taskOut = 0;
  for (const [wid, n] of Object.entries(k.perDay)) {
    if (!n) continue;
    const wl = w[wid];
    const o = n * wl.steps * wl.writeTokens, i = n * wl.steps * (wl.readTokens - wl.cachedTokens), c = n * wl.steps * wl.cachedTokens;
    out += o; inNew += i; cached += c; tasks += n; taskOut += o;
    const po = (o * wl.peak) / DAY_S, pi = (i * wl.peak) / DAY_S;
    if (wid === 'agentBackground') { peakOutB += po; peakInB += pi; } else { peakOutI += po; peakInI += pi; }
  }
  return { out, inNew, cached, peakOutI, peakOutB, peakInI, peakInB, outPerTask: tasks ? taskOut / tasks : 0 };
}

function caseWeights(mix) {
  const tot = (mix.A || 0) + (mix.B || 0) + (mix.C || 0);
  return tot > 0 ? { A: (mix.A || 0) / tot, B: (mix.B || 0) / tot, C: (mix.C || 0) / tot } : { A: 0, B: 1, C: 0 };
}

export function demand(scenario) {
  const wts = caseWeights(scenario.caseMix);
  const d = { users: 0, outInteractiveTokS: 0, outBackgroundTokS: 0, inInteractiveTokS: 0, inBackgroundTokS: 0,
    outChatTokS: 0, outAgentITokS: 0, dailyOut: 0, dailyIn: 0, dailyCached: 0, outPerTask: 0 };
  let taskW = 0;
  for (const cid of ['A', 'B', 'C']) {
    const w = wts[cid]; if (!w) continue;
    const users = C.cases[cid].users * w, u = perUserDaily(cid), k = C.cases[cid];
    d.users += users;
    d.outInteractiveTokS += users * u.peakOutI; d.outBackgroundTokS += users * u.peakOutB;
    d.inInteractiveTokS += users * u.peakInI; d.inBackgroundTokS += users * u.peakInB;
    const chatOutPeak = (k.perDay.chat * C.workloads.chat.writeTokens * C.workloads.chat.peak) / DAY_S;
    d.outChatTokS += users * chatOutPeak; d.outAgentITokS += users * (u.peakOutI - chatOutPeak);
    d.dailyOut += users * u.out; d.dailyIn += users * u.inNew; d.dailyCached += users * u.cached;
    d.outPerTask += w * u.outPerTask; taskW += w;
  }
  d.outTokS = d.outInteractiveTokS + d.outBackgroundTokS;
  d.inTokS = d.inInteractiveTokS + d.inBackgroundTokS;
  d.outPerTask = taskW ? d.outPerTask / taskW : 0;
  return d;
}

/** Racks of each pool type that serve 100% of peak demand (before off-world availability loss). */
export function neededRacks(scenario) {
  const R = racksForYear(scenario.year), d = demand(scenario);
  const pre = R[scenario.pools.prefill.type], dec = R[scenario.pools.decode.type];
  const decodeRackS = d.outChatTokS / (dec.chips * dec.decodeChatTokPerChip)
    + (d.outAgentITokS + d.outBackgroundTokS) / (dec.chips * dec.decodeAgentTokPerChip);
  const prefillRackS = d.inTokS / (pre.chips * pre.prefillTokPerChip);
  return { prefillRacks: Math.ceil(prefillRackS), decodeRacks: Math.ceil(decodeRackS) };
}

// ---------- scenario ----------

export function defaultScenario() {
  const s = {
    year: 2035,
    budgetUSD: C.challenge.budgetUSD,
    gridCapMW: C.challenge.gridCapMW,
    launchUSDPerKg: C.challenge.launchUSDPerKg,
    carbonUSDPerT: C.challenge.carbonUSDPerT,
    energyPriceMult: 1,
    buildingUSDPerMW: C.facility.buildingUSDPerMW,
    caseMix: { A: 0, B: 1, C: 0 },
    pools: { prefill: { type: 'gpu', racks: 0 }, decode: { type: 'gpu', racks: 0 } },
    sites: Object.fromEntries(SITE_IDS.map((id) => [id, { enabled: true, weight: C.sites[id].weight, cooling: 'dlc' }])),
    offworld: { leo: { enabled: false, weight: 1 }, moon: { enabled: false, weight: 1 }, mars: { enabled: false, weight: 1 } },
    finance: { discountRate: C.finance.discountRate, maintPctPerYear: C.finance.maintPctPerYear,
      revenueModel: C.finance.revenueModel, subUSDPerUserMonth: C.finance.subUSDPerUserMonth,
      priceOutUSDPerM: C.finance.priceOutUSDPerM, priceInUSDPerM: C.finance.priceInUSDPerM, priceCachedUSDPerM: C.finance.priceCachedUSDPerM },
    chipLab: { dies: C.chipLab.dies, hbm: C.chipLab.hbm, stack: 1, powerFlow: true },
    view: { site: 'wtx', pool: 'decode' },
  };
  return sizePools(s);
}

export function sizePools(scenario) {
  const s = clone(scenario), n = neededRacks(s);
  s.pools.prefill.racks = n.prefillRacks; s.pools.decode.racks = n.decodeRacks;
  return s;
}

/** Scale both pools so Earth facility power fits the grid cap (Earth only). */
export function fitToGrid(scenario) {
  let s = clone(scenario);
  for (const k of Object.keys(s.offworld)) s.offworld[k].enabled = false;
  const m = derive(s), f = m.totals.earthFacilityMW > 0 ? s.gridCapMW / m.totals.earthFacilityMW : 1;
  if (f < 1) { s.pools.prefill.racks = Math.floor(s.pools.prefill.racks * f); s.pools.decode.racks = Math.floor(s.pools.decode.racks * f); }
  // Per-site rounding can leave a fraction of a rack over the cap; trim one rack at a time.
  for (let i = 0; i < 50 && derive(s).totals.earthFacilityMW > s.gridCapMW; i++) {
    const p = s.pools.prefill.racks >= s.pools.decode.racks ? s.pools.prefill : s.pools.decode;
    p.racks = Math.max(0, p.racks - 1);
  }
  return s;
}

const SELECT_COOLING = ['airChillers', 'airEvap', 'dlc', 'immersion'];
export const PARAMS = [
  { path: 'year', label: 'Year', group: 'Challenge', min: 2025, max: 2035, step: 1, unit: '', sourceId: 'a.year', kind: 'range' },
  { path: 'budgetUSD', label: '5-year budget', group: 'Challenge', min: 5e9, max: 100e9, step: 1e9, unit: 'USD', sourceId: 's9.setting', kind: 'range' },
  { path: 'gridCapMW', label: 'Earth grid cap', group: 'Challenge', min: 100, max: 2000, step: 10, unit: 'MW', sourceId: 's9.setting', kind: 'range' },
  { path: 'launchUSDPerKg', label: 'Launch cost to orbit', group: 'Challenge', min: 50, max: 2000, step: 10, unit: 'USD/kg', sourceId: 's9.setting', kind: 'range' },
  { path: 'carbonUSDPerT', label: 'Carbon price', group: 'Challenge', min: 0, max: 300, step: 10, unit: 'USD/t', sourceId: 's15.carbon', kind: 'range' },
  { path: 'energyPriceMult', label: 'Energy price multiplier', group: 'Challenge', min: 0.5, max: 2, step: 0.05, unit: 'x', sourceId: 'spec.energy_price', kind: 'range' },
  { path: 'buildingUSDPerMW', label: 'Building cost per IT MW', group: 'Challenge', min: 5e6, max: 30e6, step: 0.1e6, unit: 'USD/MW', sourceId: 'ext.cw_build', kind: 'range' },
  { path: 'caseMix.A', label: 'Case A: prompters', group: 'User case', min: 0, max: 1, step: 0.05, unit: 'weight', sourceId: 's11.cases', kind: 'range' },
  { path: 'caseMix.B', label: 'Case B: agent developers', group: 'User case', min: 0, max: 1, step: 0.05, unit: 'weight', sourceId: 's11.cases', kind: 'range' },
  { path: 'caseMix.C', label: 'Case C: knowledge workers', group: 'User case', min: 0, max: 1, step: 0.05, unit: 'weight', sourceId: 's11.cases', kind: 'range' },
  { path: 'pools.prefill.type', label: 'Prefill chips', group: 'Serving', kind: 'select', options: [['gpu', 'GPU'], ['air', 'Air card']], sourceId: 's9.fleet' },
  { path: 'pools.prefill.racks', label: 'Prefill racks', group: 'Serving', min: 0, max: 40000, step: 1, unit: 'racks', sourceId: 'd.capacity', kind: 'range' },
  { path: 'pools.decode.type', label: 'Decode chips', group: 'Serving', kind: 'select', options: [['gpu', 'GPU'], ['lpu', 'LPU']], sourceId: 's9.fleet' },
  { path: 'pools.decode.racks', label: 'Decode racks', group: 'Serving', min: 0, max: 40000, step: 1, unit: 'racks', sourceId: 'd.capacity', kind: 'range' },
  ...SITE_IDS.flatMap((id) => [
    { path: `sites.${id}.enabled`, label: `${C.sites[id].name}`, group: 'Sites', kind: 'toggle', sourceId: 's13.rtt' },
    { path: `sites.${id}.weight`, label: `${C.sites[id].name} share of grid`, group: 'Sites', min: 0, max: 3, step: 0.1, unit: 'weight', sourceId: 'a.alloc', kind: 'range' },
    { path: `sites.${id}.cooling`, label: `${C.sites[id].name} cooling`, group: 'Sites', kind: 'select', options: SELECT_COOLING.map((c) => [c, C.cooling[c].label]), sourceId: 's15.pue' },
  ]),
  ...OFFWORLD_KINDS.map((id) => ({ path: `offworld.${id}.enabled`, label: `${C.sites[id].name}`, group: 'Off-world', kind: 'toggle', sourceId: 's15.orbit' })),
  { path: 'finance.discountRate', label: 'Discount rate', group: 'Finance', min: 0.05, max: 0.2, step: 0.005, unit: '/yr', sourceId: 'a.discount', kind: 'range' },
  { path: 'finance.revenueModel', label: 'Revenue model', group: 'Finance', kind: 'select', options: [['subscription', 'Subscription per user'], ['tokens', 'API price per token']], sourceId: 'a.revenue_model' },
  { path: 'finance.subUSDPerUserMonth', label: 'Subscription price', group: 'Finance', min: 1, max: 500, step: 1, unit: 'USD/user/month', sourceId: 'ext.sub_price', kind: 'range' },
  { path: 'finance.priceOutUSDPerM', label: 'Output token price', group: 'Finance', min: 0.01, max: 10, step: 0.01, unit: 'USD/M', sourceId: 'ext.kimi_price', kind: 'range' },
  { path: 'finance.priceInUSDPerM', label: 'Input token price', group: 'Finance', min: 0.001, max: 3, step: 0.001, unit: 'USD/M', sourceId: 'ext.kimi_price', kind: 'range' },
  { path: 'finance.priceCachedUSDPerM', label: 'Cached input price', group: 'Finance', min: 0, max: 1, step: 0.001, unit: 'USD/M', sourceId: 'ext.kimi_price', kind: 'range' },
  { path: 'chipLab.dies', label: 'Compute dies', group: 'Chip workbench', min: 1, max: 8, step: 1, unit: 'dies', sourceId: 'a.chip_dies', kind: 'range' },
  { path: 'chipLab.hbm', label: 'HBM stacks', group: 'Chip workbench', min: 2, max: 16, step: 1, unit: 'stacks', sourceId: 'a.chip_dies', kind: 'range' },
  { path: 'chipLab.stack', label: '3D layers', group: 'Chip workbench', min: 1, max: 3, step: 1, unit: 'layers', sourceId: 'a.chip_dies', kind: 'range' },
  { path: 'chipLab.powerFlow', label: 'Show power flow', group: 'Chip workbench', kind: 'toggle', sourceId: 'a.chip_dies' },
];

export function getParam(scenario, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), scenario);
}

export function applyParam(scenario, path, value) {
  const s = clone(scenario), keys = path.split('.');
  let o = s;
  for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]] ??= {};
  o[keys[keys.length - 1]] = value;
  return s;
}

/** Presets in tour order. The app opens on 'fit-grid', the spec's core story. */
export const PRESETS = {
  'fit-grid': { label: 'Start: Case B in 500 MW of grid', make: () => fitToGrid(defaultScenario()) },
  'lpu-decode': { label: 'Decode on LPUs, still 500 MW', make: () => fitToGrid(sizePools(applyParam(defaultScenario(), 'pools.decode.type', 'lpu'))) },
  'lpu-orbit': { label: 'LPUs on Earth, overflow to orbit', make: () => applyParam(sizePools(applyParam(defaultScenario(), 'pools.decode.type', 'lpu')), 'offworld.leo.enabled', true) },
  'challenge-b': { label: 'All of Case B on Earth (grid fails)', make: () => defaultScenario() },
  'orbit': { label: 'All of Case B, GPUs, overflow to orbit', make: () => applyParam(defaultScenario(), 'offworld.leo.enabled', true) },
  'today-2025': { label: 'Same demand on 2025 racks', make: () => sizePools(applyParam(defaultScenario(), 'year', 2025)) },
  'case-a': { label: 'Case A: 4B prompters', make: () => sizePools(applyParam(applyParam(defaultScenario(), 'caseMix', { A: 1, B: 0, C: 0 }), 'year', 2035)) },
  'case-c': { label: 'Case C: 400M knowledge workers', make: () => sizePools(applyParam(defaultScenario(), 'caseMix', { A: 0, B: 0, C: 1 })) },
};

// ---------- sites ----------

function climateOf(tempC) {
  if (tempC == null) return 0.5;
  return clamp((tempC - 8) / (24 - 8), 0, 1);
}

function pueOf(cooling, climate) {
  const c = C.cooling[cooling];
  return c.pueCold + (c.pueDesert - c.pueCold) * climate;
}

function sentimentOf(id, data) {
  const items = (data && data.sentiment && data.sentiment[id]) || [];
  if (!items.length) return { score: 0, label: 'No coverage found', items: [] };
  const v = { support: 1, mixed: 0, oppose: -1 };
  const score = Math.round((items.reduce((a, x) => a + (v[x.stance] ?? 0), 0) / items.length) * 2);
  return { score, label: score > 0 ? 'Mostly supportive' : score < 0 ? 'Mostly opposed' : 'Mixed', items };
}

// ---------- main derivation ----------

/**
 * @param {object} scenario
 * @param {object} [data]  optional { sentiment: {siteId: [...]}} merged into site metrics
 */
export function derive(scenario, data) {
  const s = scenario, R = racksForYear(s.year), d = demand(s);
  const preT = R[s.pools.prefill.type], decT = R[s.pools.decode.type];
  const earthIds = SITE_IDS.filter((id) => s.sites[id] && s.sites[id].enabled && (s.sites[id].weight ?? 1) > 0);
  const offIds = OFFWORLD_KINDS.filter((id) => s.offworld[id] && s.offworld[id].enabled);
  const wSum = earthIds.reduce((a, id) => a + (s.sites[id].weight ?? 1), 0) || 1;

  // 1. Earth placement by weight; overflow beyond each site's grid share moves off-world if any is enabled.
  const sites = {};
  // With no Earth site switched on, every rack goes off-world (or nowhere, if none is enabled).
  let overflowPre = earthIds.length ? 0 : s.pools.prefill.racks, overflowDec = earthIds.length ? 0 : s.pools.decode.racks;
  const perRackKW = { pre: preT.kW, dec: decT.kW };
  let assignedPre = 0, assignedDec = 0;
  earthIds.forEach((id, idx) => {
    const cat = C.sites[id], sc = s.sites[id], share = (sc.weight ?? 1) / wSum;
    const climate = climateOf(cat.tempC), pue = pueOf(sc.cooling, climate);
    let pre = idx === earthIds.length - 1 ? s.pools.prefill.racks - assignedPre : Math.round(s.pools.prefill.racks * share);
    let dec = idx === earthIds.length - 1 ? s.pools.decode.racks - assignedDec : Math.round(s.pools.decode.racks * share);
    assignedPre += pre; assignedDec += dec;
    const allocMW = s.gridCapMW * share;
    if (offIds.length) {
      const itCap = allocMW / pue, it = (pre * perRackKW.pre + dec * perRackKW.dec) / 1000;
      if (it > itCap && it > 0) {
        const f = itCap / it, keepPre = Math.floor(pre * f), keepDec = Math.floor(dec * f);
        overflowPre += pre - keepPre; overflowDec += dec - keepDec; pre = keepPre; dec = keepDec;
      }
    }
    sites[id] = { id, name: cat.name, place: cat.place, kind: 'earth', enabled: true, lat: cat.lat, lon: cat.lon, rttMs: cat.rttMs,
      allocMW, cooling: sc.cooling, climate, pue, tempC: cat.tempC, racks: { prefill: pre, decode: dec },
      priceUSDPerMWh: cat.priceUSDPerMWh * (s.energyPriceMult ?? 1), carbonKgPerMWh: cat.carbonKgPerMWh, waterStress: cat.waterStress };
  });
  for (const id of SITE_IDS) {
    if (sites[id]) continue;
    const cat = C.sites[id];
    sites[id] = { id, name: cat.name, place: cat.place, kind: 'earth', enabled: false, lat: cat.lat, lon: cat.lon, rttMs: cat.rttMs, allocMW: 0,
      cooling: (s.sites[id] && s.sites[id].cooling) || 'dlc', climate: climateOf(cat.tempC), pue: pueOf((s.sites[id] && s.sites[id].cooling) || 'dlc', climateOf(cat.tempC)),
      tempC: cat.tempC, racks: { prefill: 0, decode: 0 }, priceUSDPerMWh: cat.priceUSDPerMWh, carbonKgPerMWh: cat.carbonKgPerMWh, waterStress: cat.waterStress };
  }
  // 2. Off-world: overflow split by weight. Moon and Mars take background work only (serving step).
  const oSum = offIds.reduce((a, id) => a + (s.offworld[id].weight ?? 1), 0) || 1;
  let oPre = 0, oDec = 0;
  for (const id of OFFWORLD_KINDS) {
    const cat = C.sites[id], on = offIds.includes(id);
    const idx = offIds.indexOf(id), share = on ? (s.offworld[id].weight ?? 1) / oSum : 0;
    let pre = 0, dec = 0;
    if (on) {
      pre = idx === offIds.length - 1 ? overflowPre - oPre : Math.round(overflowPre * share);
      dec = idx === offIds.length - 1 ? overflowDec - oDec : Math.round(overflowDec * share);
      oPre += pre; oDec += dec;
    }
    sites[id] = { id, name: cat.name, kind: cat.kind, enabled: on, lat: null, lon: null, rttMs: cat.rttMs, allocMW: 0, cooling: 'radiators',
      climate: 0, pue: 1, tempC: null, racks: { prefill: pre, decode: dec }, priceUSDPerMWh: 0, carbonKgPerMWh: 0, waterStress: null, launchMult: cat.launchMult };
  }

  // 3. Per-site power, cost, water, carbon, capacity.
  const H5 = C.challenge.hours5yr, avail = C.orbit.chipsWorking;
  const T = { earthITMW: 0, earthFacilityMW: 0, offworldITMW: 0, rackUSD: 0, buildingUSD: 0, launchUSD: 0, energyUSD5yr: 0, carbonUSD5yr: 0,
    carbonTPerYear: 0, waterMLPerYear: 0, chips: 0, racks: { prefill: 0, decode: 0, total: 0 } };
  let nearPre = 0, nearDec = 0, farPre = 0, farDec = 0, maxInteractiveRtt = 0;
  for (const id of Object.keys(sites)) {
    const m = sites[id], cool = C.cooling[m.cooling];
    const it = (m.racks.prefill * preT.kW + m.racks.decode * decT.kW) / 1000;
    m.rackType = { prefill: preT.id, decode: decT.id };
    m.itMW = it; m.facilityMW = it * m.pue;
    m.halls = m.kind === 'earth' ? Math.max(m.racks.prefill + m.racks.decode > 0 ? 1 : 0, Math.ceil((m.racks.prefill + m.racks.decode) / C.facility.hallRacks)) : 0;
    m.energyMWhPerYear = m.kind === 'earth' ? m.facilityMW * HOURS_YEAR : 0;
    m.energyUSD5yr = m.kind === 'earth' ? m.facilityMW * H5 * m.priceUSDPerMWh : 0;
    m.carbonTPerYear = m.kind === 'earth' && m.carbonKgPerMWh != null ? (m.energyMWhPerYear * m.carbonKgPerMWh) / 1000 : 0;
    m.waterMLPerYear = m.kind === 'earth' ? (m.energyMWhPerYear * 1000 * (cool.waterLPerKWh || 0)) / 1e6 : 0;
    m.rackUSD = m.racks.prefill * preT.costUSD + m.racks.decode * decT.costUSD;
    m.buildingUSD = m.kind === 'earth' ? it * (s.buildingUSDPerMW ?? C.facility.buildingUSDPerMW) : 0;
    m.launchMassT = m.kind !== 'earth' ? it * C.orbit.massTPerMW : 0;
    m.launchUSD = m.kind !== 'earth' ? m.launchMassT * 1000 * s.launchUSDPerKg * (m.launchMult || 1) : 0;
    m.radiatorM2 = m.kind !== 'earth' ? it * C.orbit.radiatorM2PerMW : 0;
    const a = m.kind === 'earth' ? 1 : avail;
    m.capacity = {
      prefillTokS: m.racks.prefill * preT.chips * preT.prefillTokPerChip * a,
      decodeTokS: m.racks.decode * decT.chips * decT.decodeAgentTokPerChip * a,
    };
    m.servesInteractive = m.rttMs <= C.workloads.chat.ttftS * 1000 || m.rttMs <= C.workloads.agentInteractive.ttftS * 1000;
    m.servesBackground = true;
    m.maxRackKW = Math.max(m.racks.prefill ? preT.kW : 0, m.racks.decode ? decT.kW : 0);
    m.coolingMaxRackKW = cool.maxRackKW;
    m.coolingOk = m.maxRackKW <= cool.maxRackKW;
    m.sentiment = sentimentOf(id, data);
    const rackUnitsPre = m.racks.prefill * a, rackUnitsDec = m.racks.decode * a;
    if (m.servesInteractive) { nearPre += rackUnitsPre; nearDec += rackUnitsDec; if (it > 0) maxInteractiveRtt = Math.max(maxInteractiveRtt, m.rttMs); }
    else { farPre += rackUnitsPre; farDec += rackUnitsDec; }
    if (m.kind === 'earth') { T.earthITMW += it; T.earthFacilityMW += m.facilityMW; } else T.offworldITMW += it;
    T.rackUSD += m.rackUSD; T.buildingUSD += m.buildingUSD; T.launchUSD += m.launchUSD; T.energyUSD5yr += m.energyUSD5yr;
    T.carbonTPerYear += m.carbonTPerYear; T.waterMLPerYear += m.waterMLPerYear;
    T.racks.prefill += m.racks.prefill; T.racks.decode += m.racks.decode;
    T.chips += m.racks.prefill * preT.chips + m.racks.decode * decT.chips;
  }
  T.racks.total = T.racks.prefill + T.racks.decode;
  T.carbonUSD5yr = T.carbonTPerYear * C.challenge.years * s.carbonUSDPerT;
  T.itMW = T.earthITMW + T.offworldITMW;
  T.facilityMW = T.earthFacilityMW + T.offworldITMW;
  T.gridCapMW = s.gridCapMW; T.budgetUSD = s.budgetUSD;
  T.cost5yrUSD = T.rackUSD + T.buildingUSD + T.launchUSD + T.energyUSD5yr + T.carbonUSD5yr;

  // 4. Serving: interactive work only on near sites; background takes what is left plus far sites.
  const decRack = { chat: decT.chips * decT.decodeChatTokPerChip, agent: decT.chips * decT.decodeAgentTokPerChip };
  const preRack = preT.chips * preT.prefillTokPerChip;
  const needDecI = d.outChatTokS / decRack.chat + d.outAgentITokS / decRack.agent;
  const needDecB = d.outBackgroundTokS / decRack.agent;
  const needPreI = d.inInteractiveTokS / preRack, needPreB = d.inBackgroundTokS / preRack;
  const sh = (have, need) => (need <= 0 ? 1 : clamp(have / need, 0, 1));
  const servedI = Math.min(sh(nearDec, needDecI), sh(nearPre, needPreI));
  const leftDec = Math.max(0, nearDec - needDecI * servedI) + farDec, leftPre = Math.max(0, nearPre - needPreI * servedI) + farPre;
  const servedB = Math.min(sh(leftDec, needDecB), sh(leftPre, needPreB));
  const outI = d.outInteractiveTokS, outB = d.outBackgroundTokS;
  const servedAll = d.outTokS > 0 ? (outI * servedI + outB * servedB) / d.outTokS : 1;
  T.demand = { outTokS: d.outTokS, inTokS: d.inTokS, outInteractiveTokS: outI, outBackgroundTokS: outB,
    inInteractiveTokS: d.inInteractiveTokS, inBackgroundTokS: d.inBackgroundTokS, users: d.users };
  T.supply = { prefillTokS: (nearPre + farPre) * preRack, decodeTokS: (nearDec + farDec) * decRack.agent };
  T.served = { interactive: servedI, background: servedB, overall: servedAll };
  T.usersServed = d.users * servedAll;
  T.pueBlended = T.itMW > 0 ? T.facilityMW / T.itMW : 0;
  const servedOutTokS = d.outTokS * servedAll;
  T.jPerOutputToken = servedOutTokS > 0 ? (T.facilityMW * 1e6) / servedOutTokS : null;
  T.jPerTask = T.jPerOutputToken != null ? T.jPerOutputToken * d.outPerTask : null;
  T.outTokensPerTask = d.outPerTask;
  T.maxInteractiveRttMs = maxInteractiveRtt;
  const n = neededRacks(s);
  T.needed = n;
  for (const id of Object.keys(sites)) {
    const m = sites[id];
    const servedHere = m.capacity.decodeTokS * (T.supply.decodeTokS > 0 ? servedOutTokS / Math.max(servedOutTokS, T.supply.decodeTokS) : 0);
    m.jPerOutputToken = servedHere > 0 ? (m.facilityMW * 1e6) / servedHere : null;
  }

  // 5. Finance: year-0 capex, five years of revenue minus opex.
  const F = s.finance, yrs = C.challenge.years, r = F.discountRate;
  const capexUSD = T.rackUSD + T.buildingUSD + T.launchUSD;
  const tokenRevenueUSDPerYear = 365 * servedAll * (d.dailyOut * F.priceOutUSDPerM + d.dailyIn * F.priceInUSDPerM + d.dailyCached * F.priceCachedUSDPerM) / 1e6;
  const subRevenueUSDPerYear = T.usersServed * (F.subUSDPerUserMonth ?? 0) * 12;
  const revenueModel = F.revenueModel === 'tokens' ? 'tokens' : 'subscription';
  const revenueUSDPerYear = revenueModel === 'tokens' ? tokenRevenueUSDPerYear : subRevenueUSDPerYear;
  const opexUSDPerYear = T.energyUSD5yr / yrs + T.carbonUSD5yr / yrs + F.maintPctPerYear * T.rackUSD;
  const cashflows = [-capexUSD, ...Array.from({ length: yrs }, () => revenueUSDPerYear - opexUSDPerYear)];
  // Break-even revenue: the flat yearly revenue that makes NPV zero = opex + capex / annuity factor.
  const annuity = r > 0 ? (1 - Math.pow(1 + r, -yrs)) / r : yrs;
  const breakevenRevenueUSDPerYear = opexUSDPerYear + capexUSD / annuity;
  const finance = {
    discountRate: r, revenueModel, revenueUSDPerYear, tokenRevenueUSDPerYear, subRevenueUSDPerYear,
    opexUSDPerYear, capexUSD, cashflows,
    npvUSD: npv(r, cashflows), irr: irr(cashflows), paybackYears: paybackYears(cashflows), irrLabel: '',
    usdPerUserMonth: T.usersServed > 0 ? revenueUSDPerYear / T.usersServed / 12 : null,
    breakevenRevenueUSDPerYear,
    breakevenUSDPerUserMonth: T.usersServed > 0 ? breakevenRevenueUSDPerYear / T.usersServed / 12 : null,
    breakevenPriceOutUSDPerM: tokenRevenueUSDPerYear > 0 ? F.priceOutUSDPerM * (breakevenRevenueUSDPerYear / tokenRevenueUSDPerYear) : null,
    breakevenTokenPriceScale: tokenRevenueUSDPerYear > 0 ? breakevenRevenueUSDPerYear / tokenRevenueUSDPerYear : null,
  };
  finance.irrLabel = finance.irr != null ? `${(finance.irr * 100).toFixed(1)}%`
    : finance.npvUSD > 0 ? 'above 1,000%' : 'none (never pays back)';
  T.usdPerMTokOut = servedOutTokS > 0 ? ((capexUSD / yrs + opexUSDPerYear) / (servedOutTokS * 3600 * HOURS_YEAR)) * 1e6 : null;

  // 6. Money flows for the Sankey (five-year totals).
  const rev5 = revenueUSDPerYear * yrs, spend5 = T.cost5yrUSD + F.maintPctPerYear * T.rackUSD * yrs;
  const money = {
    nodes: [{ id: 'revenue', label: 'Token revenue' }, { id: 'gap', label: 'Funding gap' }, { id: 'spend', label: '5-year spend' },
      { id: 'profit', label: 'Profit' }, { id: 'racks', label: 'Racks' }, { id: 'buildings', label: 'Buildings' }, { id: 'launch', label: 'Launches' },
      { id: 'energy', label: 'Energy' }, { id: 'carbon', label: 'Carbon' }, { id: 'maint', label: 'Operations' }],
    links: [
      { source: 'revenue', target: 'spend', usd: Math.min(rev5, spend5) },
      { source: 'gap', target: 'spend', usd: Math.max(0, spend5 - rev5) },
      { source: 'revenue', target: 'profit', usd: Math.max(0, rev5 - spend5) },
      { source: 'spend', target: 'racks', usd: T.rackUSD },
      { source: 'spend', target: 'buildings', usd: T.buildingUSD },
      { source: 'spend', target: 'launch', usd: T.launchUSD },
      { source: 'spend', target: 'energy', usd: T.energyUSD5yr },
      { source: 'spend', target: 'carbon', usd: T.carbonUSD5yr },
      { source: 'spend', target: 'maint', usd: F.maintPctPerYear * T.rackUSD * yrs },
    ].filter((l) => l.usd > 0),
  };

  // 7. Chip workbench (focused rack type).
  const chipType = s.view && s.view.pool === 'prefill' ? preT : decT;
  const lab = s.chipLab || {};
  const dies = lab.dies ?? C.chipLab.dies, hbm = lab.hbm ?? C.chipLab.hbm, stack = lab.stack ?? 1;
  const baseW = chipType.kWPerChip * 1000, scaleW = (dies / C.chipLab.dies) * stack;
  const chipW = baseW * scaleW, hbmW = hbm * C.chipLab.hbmW, computeW = Math.max(0, chipW - hbmW);
  const dieAreaMM2 = dies * C.chipLab.gpuDieMM[0] * C.chipLab.gpuDieMM[1];
  const rackKWScaled = (chipW * chipType.chips) / 1000;
  const focusSite = sites[(s.view && s.view.site) || 'wtx'] || sites.wtx;
  const chip = { type: chipType.id, label: chipType.label, kW: chipW / 1000, dies, hbm, stack, dieAreaMM2,
    heatFluxWPerCm2: computeW / (dieAreaMM2 / 100), hbmW, computeW, rackKW: rackKWScaled,
    needsLiquid: rackKWScaled > C.cooling.airChillers.maxRackKW, coolingOk: rackKWScaled <= C.cooling[focusSite.cooling].maxRackKW,
    siteCooling: focusSite.cooling, powerFlow: lab.powerFlow !== false };

  // 8. Checks, in CHECK_ORDER.
  const pct = (a, b) => (b > 0 ? a / b : 0);
  const coolFail = Object.values(sites).find((m) => m.kind === 'earth' && m.enabled && (m.racks.prefill + m.racks.decode) > 0 && !m.coolingOk);
  // Water: evaporative cooling at a desert-column site (a.water_rule). Water-stress scores were not retrieved.
  const waterBad = Object.values(sites).filter((m) => m.kind === 'earth' && m.enabled && m.cooling === 'airEvap' && m.climate >= 0.75 && m.itMW > 0);
  const farSites = Object.values(sites).filter((m) => !m.servesInteractive && (m.racks.prefill + m.racks.decode) > 0);
  const farRacks = farSites.reduce((a, m) => a + m.racks.prefill + m.racks.decode, 0);
  const farNames = farSites.map((m) => `${m.name} ${m.rttMs >= 60000 ? Math.round(m.rttMs / 60000) + ' min' : (m.rttMs / 1000).toFixed(1) + ' s'}`).join(', ');
  const latencyBinding = servedI < 0.999 && farRacks > 0;
  const checks = [
    { id: 'grid', ok: T.earthFacilityMW <= s.gridCapMW + 1e-6, label: 'Grid', value: T.earthFacilityMW, limit: s.gridCapMW, unit: 'MW',
      msg: `Earth sites draw ${Math.round(T.earthFacilityMW)} MW against a ${Math.round(s.gridCapMW)} MW grid cap`, cause: { level: 'fleet', focus: {} } },
    { id: 'budget', ok: T.cost5yrUSD <= s.budgetUSD, label: 'Budget', value: T.cost5yrUSD, limit: s.budgetUSD, unit: 'USD',
      msg: `5-year cost $${(T.cost5yrUSD / 1e9).toFixed(1)}B against a $${(s.budgetUSD / 1e9).toFixed(0)}B budget`, cause: { level: 'fleet', focus: {} } },
    { id: 'serving', ok: servedI >= 0.999 && servedB >= 0.999, label: 'Serving', value: servedAll, limit: 1, unit: 'share',
      msg: `Serves ${(servedI * 100).toFixed(0)}% of interactive and ${(servedB * 100).toFixed(0)}% of background demand at peak`, cause: { level: 'rack', focus: { site: (s.view && s.view.site) || 'wtx', rack: 'decode' } } },
    { id: 'cooling', ok: !coolFail, label: 'Cooling fit', value: coolFail ? coolFail.maxRackKW : 0, limit: coolFail ? coolFail.coolingMaxRackKW : 0, unit: 'kW per rack',
      msg: coolFail ? `${coolFail.name}: ${Math.round(coolFail.maxRackKW)} kW racks exceed the ${C.cooling[coolFail.cooling].label.toLowerCase()} limit of ${coolFail.coolingMaxRackKW} kW` : 'Every rack suits its hall cooling',
      cause: coolFail ? { level: 'hall', focus: { site: coolFail.id, building: '0', hall: '0' } } : { level: 'fleet', focus: {} } },
    { id: 'latency', ok: !latencyBinding, label: 'Latency', value: farRacks, limit: 0, unit: 'racks too far for interactive work',
      msg: latencyBinding
        ? `Interactive demand is short, and ${Math.round(farRacks)} racks on the Moon or Mars are too far away to help (round trip ${farNames})`
        : `Interactive work runs within ${maxInteractiveRtt} ms round trip; Moon and Mars take background work only`,
      cause: { level: 'offworld', focus: {} } },
    { id: 'water', ok: waterBad.length === 0, label: 'Water', value: T.waterMLPerYear, limit: 0, unit: 'ML/yr',
      msg: waterBad.length ? `Evaporative cooling in a desert climate: ${waterBad.map((m) => `${m.name} ${Math.round(m.waterMLPerYear)} ML a year`).join(', ')}` : `${Math.round(T.waterMLPerYear)} ML of water a year`,
      cause: waterBad.length ? { level: 'site', focus: { site: waterBad[0].id } } : { level: 'fleet', focus: {} } },
  ];
  for (const c of checks) {
    c.severity = c.ok ? 'ok' : 'fail';
    if (c.ok && c.id === 'grid' && pct(T.earthFacilityMW, s.gridCapMW) > 0.95) c.severity = 'warn';
    if (c.ok && c.id === 'budget' && pct(T.cost5yrUSD, s.budgetUSD) > 0.95) c.severity = 'warn';
  }
  checks.sort((a, b) => CHECK_ORDER.indexOf(a.id) - CHECK_ORDER.indexOf(b.id));
  const firstFailing = checks.find((c) => c.severity === 'fail') || null;

  return { year: s.year, racksForYear: R, sites, totals: T, chip, finance, money, checks, firstFailing };
}

/** Re-size the same design for each year and report the headline numbers. */
export function projectYears(scenario, years = [2025, 2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034, 2035], data) {
  return years.map((year) => {
    const sy = sizePools(applyParam(scenario, 'year', year)), m = derive(sy, data);
    return { year, racks: m.totals.racks.total, itMW: m.totals.itMW, earthFacilityMW: m.totals.earthFacilityMW, cost5yrUSD: m.totals.cost5yrUSD,
      jPerOutputToken: m.totals.jPerOutputToken, served: m.totals.served.overall, npvUSD: m.finance.npvUSD, irr: m.finance.irr,
      firstFailingId: m.firstFailing ? m.firstFailing.id : null };
  });
}
