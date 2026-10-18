// The challenge catalog. Every object carries `src` (a SOURCES id) that covers its numeric fields;
// a field-level override is written src_<field>. tests/sources.test.mjs enforces this.
// Slide numbers win over every other source. Team (Terawatt) values fill gaps the slides leave.

export const CATALOG = {
  challenge: {
    src: 's9.setting',
    budgetUSD: 30e9,
    gridCapMW: 500,
    launchUSDPerKg: 200,
    carbonUSDPerT: 100, src_carbonUSDPerT: 's15.carbon',
    energyUSDPerMWh: 50, src_energyUSDPerMWh: 'spec.energy_price',
    hours5yr: 43800, src_hours5yr: 'spec.hours',
    years: 5,
  },

  // Rack types. 2035 values from slide 12; GB200 NVL72 is the 2025 baseline.
  racks: {
    gpu: { src: 's12.racks', label: 'GPU rack', year: 2035, kW: 792, chips: 144, costUSD: 23.8e6,
      prefillTokPerChip: 120000, src_prefillTokPerChip: 'tw.prefill',
      decodeAgentTokPerChip: 11700, src_decodeAgentTokPerChip: 's14.decode',
      decodeChatTokPerChip: 58000, src_decodeChatTokPerChip: 's14.decode',
      pflopsPerChip: 60, src_pflopsPerChip: 'tw.pflops',
      memoryTB: 3, bandwidthTBs: 120, src_memoryTB: 's14.memory', src_bandwidthTBs: 's14.memory',
      roles: ['prefill', 'decode'] },
    lpu: { src: 's12.racks', label: 'LPU rack', year: 2035, kW: 516, chips: 256, costUSD: 14.3e6,
      prefillTokPerChip: 20000, src_prefillTokPerChip: 'tw.prefill',
      decodeAgentTokPerChip: 15000, src_decodeAgentTokPerChip: 'tw.decode',
      decodeChatTokPerChip: 74400, src_decodeChatTokPerChip: 'a.chat_ratio',
      pflopsPerChip: 12, src_pflopsPerChip: 'tw.pflops',
      memoryTB: 0.16, bandwidthTBs: 200, src_memoryTB: 's14.memory', src_bandwidthTBs: 's14.memory',
      roles: ['decode'] },
    air: { src: 's12.racks', label: 'Air-card rack', year: 2035, kW: 37, chips: 32, costUSD: 0.5e6,
      prefillTokPerChip: 4000, src_prefillTokPerChip: 'tw.prefill',
      decodeAgentTokPerChip: 1500, src_decodeAgentTokPerChip: 'tw.decode',
      decodeChatTokPerChip: 7440, src_decodeChatTokPerChip: 'a.chat_ratio',
      pflopsPerChip: 2, src_pflopsPerChip: 'tw.pflops',
      roles: ['prefill'] },
    nvl72: { src: 's12.racks', label: 'GB200 NVL72 (2025)', year: 2025, kW: 132, chips: 72,
      costUSD: 4e6, src_costUSD: 'tw.nvl72_cost', costLowUSD: 3e6, costHighUSD: 5e6,
      prefillTokPerChip: 20000, src_prefillTokPerChip: 'tw.prefill',
      decodeAgentTokPerChip: 1200, src_decodeAgentTokPerChip: 'tw.decode',
      decodeChatTokPerChip: 5952, src_decodeChatTokPerChip: 'a.chat_ratio',
      pflopsPerChip: 10, src_pflopsPerChip: 'tw.pflops',
      roles: ['prefill', 'decode'] },
  },

  // Year anchors for the GPU rack line: 2025 NVL72 (slide 12), 2027 Kyber 600 kW (slide 8), 2035 GPU rack.
  gpuLine: [
    { year: 2025, kW: 132, chips: 72, costUSD: 4e6, decodeAgentTokPerChip: 1200, prefillTokPerChip: 20000, src: 's12.racks', src_costUSD: 'tw.nvl72_cost', src_decodeAgentTokPerChip: 'tw.decode', src_prefillTokPerChip: 'tw.prefill' },
    { year: 2027, kW: 600, chips: 144, src: 's8.rack_kw', src_chips: 'a.kyber' },
    { year: 2035, kW: 792, chips: 144, costUSD: 23.8e6, decodeAgentTokPerChip: 11700, prefillTokPerChip: 120000, src: 's12.racks', src_decodeAgentTokPerChip: 's14.decode', src_prefillTokPerChip: 'tw.prefill' },
  ],
  newRackYear: 2030, src_newRackYear: 'a.new_racks',

  // Cooling options (slide 15). PUE = 1 + cooling overhead + 0.04, cold and desert columns.
  cooling: {
    airChillers: { src: 's15.pue', label: 'Air + chillers', pueCold: 1.16, pueDesert: 1.54, maxRackKW: 50, waterLPerKWh: 0 },
    airEvap: { src: 's15.pue', label: 'Air + evaporative', pueCold: 1.10, pueDesert: 1.26, maxRackKW: 50, waterLPerKWh: 1.8, src_waterLPerKWh: 's15.water' },
    dlc: { src: 's15.pue', label: 'Direct liquid', pueCold: 1.07, pueDesert: 1.14, maxRackKW: 1500, waterLPerKWh: 0 },
    immersion: { src: 's15.pue', label: 'Immersion', pueCold: 1.06, pueDesert: 1.10, maxRackKW: 2000, waterLPerKWh: 0 },
    radiators: { src: 's15.orbit', label: 'Radiators (orbit)', pueCold: 1.0, pueDesert: 1.0, maxRackKW: 2000, waterLPerKWh: 0, src_maxRackKW: 'a.offworld_kit' },
  },

  // Sites. Round trips from slide 13. Price, carbon and climate come from published sources (checked
  // with curl against the raw pages on 18 Oct 2026); Iceland and Gulf prices fall back to the team values.
  sites: {
    nva: { src: 's13.rtt', name: 'N. Virginia', kind: 'earth', rttMs: 25, lat: 39.04, lon: -77.49, place: 'Ashburn, VA',
      priceUSDPerMWh: 89.9, src_priceUSDPerMWh: 'ext.eia_price', carbonKgPerMWh: 286, src_carbonKgPerMWh: 'ext.eia_co2',
      tempC: 13.2, src_tempC: 'ext.noaa_temp', waterStress: null, weight: 1, src_weight: 'a.alloc' },
    mid: { src: 's13.rtt', name: 'Midwest', kind: 'earth', rttMs: 35, lat: 39.96, lon: -82.99, place: 'Columbus, OH',
      priceUSDPerMWh: 71.0, src_priceUSDPerMWh: 'ext.eia_price', carbonKgPerMWh: 456, src_carbonKgPerMWh: 'ext.eia_co2',
      tempC: 11.9, src_tempC: 'ext.noaa_temp', waterStress: null, weight: 1, src_weight: 'a.alloc' },
    wtx: { src: 's13.rtt', name: 'West Texas', kind: 'earth', rttMs: 45, lat: 32.45, lon: -99.73, place: 'Abilene, TX',
      priceUSDPerMWh: 61.2, src_priceUSDPerMWh: 'ext.eia_price', carbonKgPerMWh: 373, src_carbonKgPerMWh: 'ext.eia_co2',
      tempC: 18.9, src_tempC: 'ext.noaa_temp', waterStress: null, weight: 1, src_weight: 'a.alloc' },
    nordics: { src: 's13.rtt', name: 'Nordics', kind: 'earth', rttMs: 70, lat: 68.44, lon: 17.43, place: 'Narvik, Norway',
      priceUSDPerMWh: 40.4, src_priceUSDPerMWh: 'ext.ssb_price', carbonKgPerMWh: 29.7, src_carbonKgPerMWh: 'ext.owid_co2',
      tempC: 7.0, src_tempC: 'ext.wiki_temp', waterStress: null, weight: 1, src_weight: 'a.alloc' },
    iceland: { src: 's13.rtt', name: 'Iceland', kind: 'earth', rttMs: 80, lat: 64.15, lon: -21.94, place: 'Reykjavik',
      priceUSDPerMWh: 30, src_priceUSDPerMWh: 'tw.sites', carbonKgPerMWh: 27.8, src_carbonKgPerMWh: 'ext.owid_co2',
      tempC: 5.1, src_tempC: 'ext.wiki_temp', waterStress: null, weight: 1, src_weight: 'a.alloc' },
    gulf: { src: 's13.rtt', name: 'Gulf', kind: 'earth', rttMs: 110, lat: 24.45, lon: 54.38, place: 'Abu Dhabi, UAE',
      priceUSDPerMWh: 50, src_priceUSDPerMWh: 'tw.sites', carbonKgPerMWh: 467.5, src_carbonKgPerMWh: 'ext.owid_co2',
      tempC: 28.1, src_tempC: 'ext.wiki_temp', waterStress: null, weight: 1, src_weight: 'a.alloc' },
    leo: { src: 's13.rtt', name: 'Low Earth orbit', kind: 'leo', rttMs: 40, launchMult: 1, src_launchMult: 's15.orbit' },
    moon: { src: 's13.rtt', name: 'Moon', kind: 'moon', rttMs: 2600, launchMult: 6, src_launchMult: 's15.orbit' },
    mars: { src: 's13.rtt', name: 'Mars', kind: 'mars', rttMs: 1500000, launchMult: 15, src_launchMult: 's15.orbit' },
  },

  // Off-world physics (slide 15).
  orbit: { src: 's15.orbit', radiatorWPerM2: 972, radiatorM2PerMW: 1080, massTPerMW: 18,
    massSplitT: { compute: 5, solar: 5, radiators: 4, structure: 4 }, chipsWorking: 0.95,
    emissivity: 0.9, tHotK: 330, tSinkK: 220, breakevenNordicsUSDPerKg: 95, breakevenWTXUSDPerKg: 170, src_breakevenNordicsUSDPerKg: 's15.breakeven', src_breakevenWTXUSDPerKg: 's15.breakeven' },

  // User cases (slide 11) and the daily task mix behind them (slides 10-11).
  cases: {
    A: { src: 's11.cases', label: 'Prompters', users: 4e9, readsPerUserDay: 1.9e6, peakOutTokS: 2.4, peakInTokS: 5.6, perDay: { chat: 30, agentInteractive: 0, agentBackground: 0 } },
    B: { src: 's11.cases', label: 'Agent developers', users: 50e6, readsPerUserDay: 860e6, peakOutTokS: 28, peakInTokS: 333, perDay: { chat: 0, agentInteractive: 12, agentBackground: 30 } },
    C: { src: 's11.cases', label: 'Knowledge workers', users: 400e6, readsPerUserDay: 104e6, peakOutTokS: 4.6, peakInTokS: 40, perDay: { chat: 20, agentInteractive: 1, agentBackground: 4 } },
  },

  workloads: {
    chat: { src: 's10.workloads', model: 'Qwen3.5-397B', readTokens: 64000, cachedTokens: 56000, writeTokens: 3500, steps: 1, ttftS: 0.6, tokS: 60, peak: 2, src_peak: 's17.peak' },
    agentInteractive: { src: 's10.workloads', model: 'Kimi K3', readTokens: 256000, cachedTokens: 250000, writeTokens: 500, steps: 80, ttftS: 2, tokS: 100, peak: 2.5, src_peak: 's17.peak' },
    agentBackground: { src: 's10.workloads', model: 'Kimi K3', readTokens: 256000, cachedTokens: 250000, writeTokens: 500, steps: 80, ttftS: 10, tokS: 30, peak: 1, src_peak: 's17.peak' },
  },

  facility: { buildingUSDPerMW: 17.6e6, src: 'ext.cw_build', teamBuildingUSDPerMW: 11e6, src_teamBuildingUSDPerMW: 'tw.building', hallRacks: 64, src_hallRacks: 'a.hall_racks' },

  chipLab: {
    src: 's28.dies', gpuDieMM: [11.5, 10.5], hbmDieMM: [10.5, 10.2], dies: 4, hbm: 4, src_dies: 'a.chip_dies', src_hbm: 'a.chip_dies',
    hbmW: 30, src_hbmW: 'tw.hbm_w', heatScaleWPerCm2: 1500, src_heatScaleWPerCm2: 'a.heat_scale',
  },

  finance: { discountRate: 0.10, src: 'a.discount', maintPctPerYear: 0.04, src_maintPctPerYear: 'a.maint',
    revenueModel: 'subscription', src_revenueModel: 'a.revenue_model',
    subUSDPerUserMonth: 20, src_subUSDPerUserMonth: 'ext.sub_price',
    // Token model: 2026 list prices for Kimi K2.6, the nearest live model to the slide's Kimi K3. Not deflated to 2035.
    priceOutUSDPerM: 4.00, priceInUSDPerM: 0.95, priceCachedUSDPerM: 0.16,
    src_priceOutUSDPerM: 'ext.kimi_price', src_priceInUSDPerM: 'ext.kimi_price', src_priceCachedUSDPerM: 'ext.kimi_price',
    // Reference plan prices drawn beside the break-even price in the business panel.
    planRefs: [
      { label: 'ChatGPT Plus', usdPerMonth: 20, src: 'ext.sub_price' },
      { label: 'Claude Pro', usdPerMonth: 20, src: 'ext.sub_price' },
      { label: 'Claude Max (from)', usdPerMonth: 100, src: 'ext.sub_price' },
      { label: 'ChatGPT Pro (from)', usdPerMonth: 100, src: 'ext.sub_price' },
    ] },

  cleanview: { src: 'cv.map', operatingCount: 1372, operatingMW: 63427, plannedCount: 2689, plannedMW: 376446, canceledCount: 43 },
};
