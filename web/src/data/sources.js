// Sources registry. Every number the app shows names one of these ids.
// kind: slide (Sundai Hack 145 Track 1 deck), spec (Rack to the Future Technical Spec PDF),
// team (Terawatt visionOS app engine, github.com/hunterh37/Terawatt), external (a published page),
// cleanview (cleanview.co map), derived (computed from other sources), assumption (ours, with why).

export const DECK = 'Sundai Hack 145 Track 1 slides, "Build the AI data center of 2035" (MIT, 18 Oct 2026)';
export const SPEC = 'Rack to the Future, Technical Spec (18 Oct 2026)';
export const TERAWATT = 'Terawatt engine, github.com/hunterh37/Terawatt';

export const SOURCES = {
  // ---- Challenge deck ----
  's8.gw_cost': { kind: 'slide', ref: `${DECK}, slide 8`, label: '$50-60B for one gigawatt of AI data center, chips included (Jensen Huang, 2025, as cited on the slide)' },
  's8.rack_kw': { kind: 'slide', ref: `${DECK}, slide 8`, label: 'Rack power 132 kW (GB200 NVL72, 2025) to 600 kW (Rubin Ultra Kyber, 2027), citing HPE and NVIDIA GTC 2025' },
  's8.pjm': { kind: 'slide', ref: `${DECK}, slide 8`, label: '10x rise in PJM grid capacity prices in two years, mostly from data center demand (Monitoring Analytics via Axios, 2025)' },
  's8.launch': { kind: 'slide', ref: `${DECK}, slide 8`, label: 'Under $200/kg launch price projected for the mid-2030s (Project Suncatcher, 2025)' },
  's9.setting': { kind: 'slide', ref: `${DECK}, slide 9`, label: '$30B five-year budget, 500 MW of Earth grid power across all sites, $200/kg to orbit, 3 user cases' },
  's9.fleet': { kind: 'slide', ref: `${DECK}, slide 9`, label: 'Prefill racks run on GPU or air card; decode racks run on GPU or LPU' },
  's10.workloads': { kind: 'slide', ref: `${DECK}, slide 10`, label: 'Standard workloads: chat on Qwen3.5-397B (64k read, 56k cached, 3,500 written, TTFT 0.6 s, 60 tok/s); agent steps on Kimi K3 (256k read, 250k cached, 500 written, 80 steps per task)' },
  's11.cases': { kind: 'slide', ref: `${DECK}, slide 11`, label: 'Cases A, B, C: target users, reads per user per day, peak tokens/s per user' },
  's12.racks': { kind: 'slide', ref: `${DECK}, slide 12`, label: '2035 racks: GPU 792 kW $23.8M 144 chips; LPU 516 kW $14.3M 256 chips; air 37 kW $0.5M 32 cards; 2025 GB200 NVL72 132 kW about $3-5M 72 GPUs' },
  's13.rtt': { kind: 'slide', ref: `${DECK}, slide 13`, label: 'Round trip to users: N. Virginia 25 ms, Midwest 35 ms, LEO 40 ms, West Texas 45 ms, Nordics 70 ms, Iceland 80 ms, Gulf 110 ms, Moon 2.6 s, Mars 25 min' },
  's13.slo': { kind: 'slide', ref: `${DECK}, slide 13`, label: 'TTFT budget: chat 0.6 s, interactive agent 2 s per step; background agents pay one round trip per task' },
  's14.decode': { kind: 'slide', ref: `${DECK}, slide 14`, label: 'One 2035 GPU: chat on Qwen3.5-397B at 60 tok/s about 960 users and 58,000 tok/s; agent on Kimi K3 at 100 tok/s about 117 users and 11,700 tok/s' },
  's14.memory': { kind: 'slide', ref: `${DECK}, slide 14`, label: 'GPU: 3 TB at 120 TB/s. LPU: 200 TB/s but only 160 GB' },
  's15.pue': { kind: 'slide', ref: `${DECK}, slide 15`, label: 'PUE = 1 + cooling + 0.04. Cold / desert / max rack: air + chillers 1.16 / 1.54 / 50 kW; air + evaporative 1.10 / 1.26 / 50 kW; direct liquid 1.07 / 1.14 / 1.5 MW; immersion 1.06 / 1.10 / 2 MW' },
  's15.water': { kind: 'slide', ref: `${DECK}, slide 15`, label: 'Evaporative cooling drinks 1.8 L of water per kWh' },
  's15.carbon': { kind: 'slide', ref: `${DECK}, slide 15`, label: 'Carbon priced at $100 per tonne' },
  's15.orbit': { kind: 'slide', ref: `${DECK}, slide 15`, label: 'Orbit: radiators only, 972 W/m2 at 330 K both sides; 1 MW of GPUs = 1,080 m2 of radiator and 18 t (compute 5, solar 5, radiators 4, structure 4); $3.6M per MW at $200/kg; 95% of chips keep working; Moon 6x launch cost, Mars 15x' },
  's15.breakeven': { kind: 'slide', ref: `${DECK}, slide 15`, label: 'Orbit matches the Nordics at about $95/kg and West Texas at about $170/kg' },
  's16.levers': { kind: 'slide', ref: `${DECK}, slide 16`, label: 'Fixed for every team: cases, models, 2035 catalog, $30B, 500 MW and speed targets' },
  's17.peak': { kind: 'slide', ref: `${DECK}, slide 17`, label: 'Peak hour: 2x chat, 2.5x agents, 1x background' },
  's22.framing': { kind: 'slide', ref: `${DECK}, slides 19-23`, label: 'Design a digital twin that minimizes joules per task; score = energy, latency, robustness, explainability' },

  // ---- Technical spec ----
  'spec.example': { kind: 'spec', ref: `${SPEC}, p. 6`, label: 'Worked example: 500 MW holds about 631 GPU racks (792 kW), about $15.0B of hardware, about $1.1B of energy over 5 years at $0.05/kWh' },
  'spec.energy_price': { kind: 'spec', ref: `${SPEC}, p. 5`, label: 'Energy price $0.05/kWh (the spec labels it an assumption)' },
  'spec.hours': { kind: 'spec', ref: `${SPEC}, p. 5`, label: '5-year energy = facility MW x 43,800 h x price' },
  'spec.ranges': { kind: 'spec', ref: `${SPEC}, pp. 4-5`, label: 'Slider ranges: budget $5B-$100B, grid 100 MW-2 GW, launch $50-$2,000/kg, sites 1-12' },

  // ---- Terawatt app engine (github.com/hunterh37/Terawatt), used where the slides are silent ----
  'tw.prefill': { kind: 'team', ref: `${TERAWATT}, Terawatt/Model/RackPreset.swift`, label: 'Prefill tokens/s per chip: GPU 120,000; LPU 20,000; air card 4,000; GB200 20,000' },
  'tw.decode': { kind: 'team', ref: `${TERAWATT}, Terawatt/Model/RackPreset.swift`, label: 'Decode tokens/s per chip: LPU 15,000; air card 1,500; GB200 1,200 (GPU decode comes from slide 14 instead)' },
  'tw.pflops': { kind: 'team', ref: `${TERAWATT}, Terawatt/Model/RackPreset.swift`, label: 'FP4 PFLOPS per chip: GPU 60, LPU 12, air card 2, GB200 10' },
  'tw.building': { kind: 'team', ref: `${TERAWATT}, Terawatt/Engine/CampusMath.swift`, label: 'Facility capex $11M per IT MW (shell, power, cooling)' },
  'tw.nvl72_cost': { kind: 'team', ref: `${TERAWATT}, Terawatt/Model/RackPreset.swift`, label: 'GB200 NVL72 rack cost $4M (midpoint of the slide range $3-5M)' },
  'tw.sites': { kind: 'team', ref: `${TERAWATT}, Terawatt/Engine/Sites.swift`, label: 'Terawatt site values, used only where no published price was found: Iceland $30/MWh, UAE $50/MWh' },
  'tw.hbm_w': { kind: 'team', ref: `${TERAWATT}, Terawatt/Model/ChipMath.swift`, label: '30 W per HBM stack' },

  // ---- Cleanview ----
  'cv.map': { kind: 'cleanview', ref: 'Cleanview US Data Center Map, cleanview.co/data-centers/us (accessed 18 Oct 2026)', url: 'https://cleanview.co/data-centers/us', label: 'US data centers with reported capacity: 1,372 operating (63.4 GW) and 2,689 planned (376 GW) map markers', quote: 'There are 4192 data centers in the US, including 1375 operating and 2765 planned facilities.' },

  // ---- Published sources (each checked with curl + grep against the raw page, 18 Oct 2026) ----
  'ext.eia_price': { kind: 'external', ref: 'U.S. EIA, Electric Power Annual, Table 2.10 (2024 data)', url: 'https://www.eia.gov/electricity/annual/html/epa_02_10.html',
    label: 'Average industrial electricity price, 2024, statewide: Virginia 8.99, Ohio 7.10, Texas 6.12 cents/kWh (= $89.9, $71.0, $61.2 per MWh)' },
  'ext.ssb_price': { kind: 'external', ref: 'Statistics Norway (SSB), electricity prices 2025; Norges Bank USD/NOK annual average 2025', url: 'https://www.ssb.no/en/energi-og-industri/energi/statistikk/elektrisitetspriser/article-for-electricity-prices/lowest-electricity-price-since-2020',
    label: 'Norway power-intensive industry paid 42 ore/kWh in 2025, excluding taxes and grid rent; at the Norges Bank 2025 average of 10.3912 NOK per USD that is $40.4/MWh',
    quote: 'For power-intensive industries, the average electricity price in 2025 was 42 øre/kWh.' },
  'ext.eia_co2': { kind: 'external', ref: 'U.S. EIA, State Electricity Profiles (2024 data)', url: 'https://www.eia.gov/electricity/state/',
    label: 'Power-sector CO2 per MWh generated in state, 2024: Virginia 631, Ohio 1,005, Texas 823 lbs/MWh (x 0.4536 = 286, 456, 373 kg/MWh)' },
  'ext.owid_co2': { kind: 'external', ref: 'Our World in Data, carbon intensity of electricity (Ember, Energy Institute), 2024', url: 'https://ourworldindata.org/grapher/carbon-intensity-electricity',
    label: 'Grid carbon intensity 2024: Norway 29.66, Iceland 27.82, United Arab Emirates 467.51 g CO2/kWh' },
  'ext.noaa_temp': { kind: 'external', ref: 'NOAA NCEI U.S. Climate Normals 1991-2020, annual mean temperature (ANN-TAVG-NORMAL)', url: 'https://www.ncei.noaa.gov/data/normals-annualseasonal/1991-2020/access/',
    label: 'Annual mean temperature: Washington Dulles 55.7 F (13.2 C), Columbus 53.5 F (11.9 C), Abilene 66.0 F (18.9 C)' },
  'ext.wiki_temp': { kind: 'external', ref: 'Wikipedia climate tables, 1991-2020 normals (citing the national weather services)', url: 'https://en.wikipedia.org/wiki/Reykjav%C3%ADk',
    label: 'Annual daily mean: Reykjavik 5.1 C, Oslo 7.0 C (used for the Norway site), Abu Dhabi 28.1 C. Secondary source; each only picks the cold or desert column on slide 15' },
  'ext.cw_build': { kind: 'external', ref: 'Cushman & Wakefield, Data Center Development Cost Guide (2026 edition)', url: 'https://www.cushmanwakefield.com/en/united-states/insights/data-center-development-cost-guide',
    label: 'Average greenfield development cost $17.6M per MW for the most modern facilities (the Terawatt app engine uses $11M per MW; the slider covers both)',
    quote: 'Developers can expect average greenfield costs of $17.6 million per MW for the most modern facilities' },
  'ext.sub_price': { kind: 'external', ref: 'claude.com/pricing and learn.chatgpt.com/docs/pricing (accessed 18 Oct 2026)', url: 'https://claude.com/pricing',
    label: 'Consumer AI plans: ChatGPT Plus $20/month; Claude Pro $20 billed monthly; Claude Max and ChatGPT Pro from $100/month' },
  'ext.kimi_price': { kind: 'external', ref: 'Moonshot AI, Kimi Open Platform pricing (accessed 18 Oct 2026)', url: 'https://platform.kimi.ai/docs/pricing/chat',
    label: 'Kimi K2.6 list price per million tokens: input $0.95, output $4.00, cached input $0.16. Used as 2035 prices without deflation' },
  'ext.together_price': { kind: 'external', ref: 'Together AI pricing (accessed 18 Oct 2026)', url: 'https://www.together.ai/pricing',
    label: 'Qwen3 235B A22B: $0.20 input and $0.60 output per million tokens; gpt-oss-120B: $0.15 and $0.60' },
  'ext.price_decline': { kind: 'external', ref: 'Epoch AI (2025-03-12); a16z, "LLMflation" (2024-11-12)', url: 'https://epoch.ai/data-insights/llm-inference-price-trends',
    label: 'Price for a fixed capability falls 9x to 900x a year (Epoch AI) or about 10x a year (a16z)',
    quote: 'The rate of decline varies dramatically depending on the performance milestone, ranging from 9x to 900x per year.' },
  'ext.google_launch': { kind: 'external', ref: 'Google Research, "Exploring a space-based, scalable AI infrastructure system design" (2025-11-04)', url: 'https://research.google/blog/exploring-a-space-based-scalable-ai-infrastructure-system-design/',
    label: 'Launch prices may fall below $200/kg by the mid-2030s', quote: 'prices may fall to less than $200/kg by the mid-2030s.' },
  'ext.epoch_dcs': { kind: 'external', ref: 'Epoch AI, Frontier Data Centers hub (updated 2026-10-12)', url: 'https://epoch.ai/data/data-centers',
    label: 'Largest known AI data centers by IT power: Colossus 2 946 MW, New Carlisle 910 MW, Fairwater Atlanta 636 MW, DayOne Nusajaya 473 MW, Meta Prometheus 471 MW' },
  'ext.sentiment': { kind: 'external', ref: 'One recent news article per site, stance labelled by us', url: '',
    label: 'Sentiment = the stance of one recent local news article per site (support, mixed or oppose). A sample, not a poll' },
  'ext.existing': { kind: 'external', ref: 'Operator, government and press pages listed per data center', url: '',
    label: 'Existing and announced AI data centers near each site, with reported capacity' },

  // ---- Derived ----
  'd.kw_per_chip': { kind: 'derived', ref: 'slide 12', label: 'kW per chip = rack kW / chips per rack (GPU 5.5, LPU 2.0, air card 1.2, GB200 1.8)' },
  'd.demand': { kind: 'derived', ref: 'slides 10, 11, 17', label: 'Peak demand = target users x peak tokens/s per user, split interactive vs background by the slide 10 workloads and slide 17 peak factors' },
  'd.capacity': { kind: 'derived', ref: 'slides 12, 14 + Terawatt', label: 'Rack capacity = chips per rack x tokens/s per chip' },
  'd.facility': { kind: 'derived', ref: 'slide 15', label: 'Facility MW = IT MW x PUE' },
  'd.placement': { kind: 'derived', ref: 'slides 9, 15', label: 'Placement: racks fill the six Earth sites by weight until facility power reaches the grid cap; when low Earth orbit, the Moon or Mars is switched on, the overflow goes there, where 95% of chips keep working' },
  'd.cost5yr': { kind: 'derived', ref: 'spec p. 5', label: '5-year cost = racks + buildings + energy over 43,800 h + carbon + launches' },
  'd.launch': { kind: 'derived', ref: 'slide 15', label: 'Launch cost = IT MW x 18 t per MW x $/kg x (1 LEO, 6 Moon, 15 Mars)' },
  'd.radiator': { kind: 'derived', ref: 'slide 15', label: 'Radiator area = IT MW x 1,080 m2' },
  'd.water': { kind: 'derived', ref: 'slide 15', label: 'Water = facility MWh x 1.8 L/kWh, evaporative cooling only' },
  'd.jtoken': { kind: 'derived', ref: 'engine', label: 'Joules per output token = facility watts / decode tokens/s served' },
  'd.finance': { kind: 'derived', ref: 'engine', label: 'NPV, IRR and payback from year-0 capex (racks, buildings, launches) and five years of revenue minus opex (energy, carbon, 4% maintenance)' },
  'd.sankey': { kind: 'derived', ref: 'engine', label: 'Five-year money flow: revenue (or the funding gap) into spend, split into racks, buildings, launches, energy, carbon and operations' },
  'd.projection': { kind: 'derived', ref: 'engine', label: 'Same demand re-sized with each year\'s rack catalog, 2025 to 2035' },
  'd.heatflux': { kind: 'derived', ref: 'slides 12, 28', label: 'Heat flux = chip watts / die area, with slide 28 die sizes (GPU 11.5 x 10.5 mm, HBM 10.5 x 10.2 mm)' },
  's28.dies': { kind: 'slide', ref: `${DECK}, slide 28 (Track 2)`, label: 'Interposer carries 4 GPU dies of 11.5 x 10.5 mm and 4 HBM dies of 10.5 x 10.2 mm' },

  // ---- Our assumptions (each says why) ----
  'a.water_rule': { kind: 'assumption', label: 'Water check fails when evaporative cooling runs at a desert-column site (annual mean at or above 20 C)', why: 'WRI Aqueduct water-stress scores could not be retrieved for this build; this rule uses only slide 15 and the site climate' },
  'a.hall_racks': { kind: 'assumption', label: '64 racks per hall', why: 'Schematic size so a hall reads at tabletop scale; does not change power or cost' },
  'a.climate': { kind: 'assumption', label: 'Climate blend: 0 at or below 8 C mean annual temperature (cold column), 1 at or above 24 C (desert column), linear between', why: 'Slide 15 gives only cold and desert PUE columns' },
  'a.alloc': { kind: 'assumption', label: 'Default grid allocation: 500 MW split across the six Earth sites in proportion to the weights in the scenario', why: 'The slides cap the total, not each site' },
  'a.chat_ratio': { kind: 'assumption', label: 'Chat decode runs 4.96x faster than agent decode on every chip type', why: 'Ratio of the two GPU figures on slide 14 (58,000 / 11,700), applied to chips the slides do not cover' },
  'a.bg_decode': { kind: 'assumption', label: 'Background agent decode gets the same tokens/s per chip as interactive agent decode', why: 'Decode is bandwidth-bound; a slower speed target fits more sessions in memory, not more tokens per step' },
  'a.kyber': { kind: 'assumption', label: '2027 Kyber rack: 144 GPU packages; price per kW and tokens per joule interpolated', why: 'Slide 8 gives only its 600 kW rating' },
  'a.year': { kind: 'assumption', label: 'GPU rack power and chip count are interpolated geometrically between the 2025, 2027 and 2035 racks; price per kW and tokens per joule are interpolated geometrically between 2025 and 2035', why: 'So a hotter rack is never less efficient per watt than an older one' },
  'a.new_racks': { kind: 'assumption', label: 'LPU and air-card racks enter the catalog in 2030', why: 'The slides list them only as 2035 options' },
  'a.offworld_kit': { kind: 'assumption', label: 'Solar and radiator hardware cost is not modelled beyond its launch mass', why: 'Slide 15 prices the mass only' },
  'a.maint': { kind: 'assumption', label: 'Maintenance and operations: 4% of hardware capex per year', why: 'Placeholder until a sourced figure is found' },
  'a.discount': { kind: 'assumption', label: 'Discount rate 10% a year', why: 'A round hurdle rate for an infrastructure build. 15-20% was also discussed; the slider runs 5-20%. Historical S&P 500 averages were not checked for this build' },
  'a.revenue_model': { kind: 'assumption', label: 'Revenue = users served x subscription price x 12 (or tokens served x list price per token)', why: 'The slides set demand, not price. The headline number is the break-even price, which needs no revenue assumption at all' },
  'a.breakeven': { kind: 'assumption', label: 'Break-even price = the flat monthly price per user that makes 5-year NPV zero: (opex + capex / annuity factor) / users served / 12', why: 'Answers "what must we charge" without guessing 2035 prices' },
  'a.interactive_split': { kind: 'assumption', label: 'Interactive work runs only where round trip is under 0.6 s (chat) or 2 s (agent); Moon and Mars take background work only', why: 'Slide 13 SLOs; prefill takes milliseconds in 2035' },
  'a.chip_dies': { kind: 'assumption', label: 'Chip workbench default: 4 compute dies + 4 HBM stacks on one package; HBM draws 30 W per stack (Terawatt) and the compute dies take the rest', why: 'Slide 28 layout (Track 2) used as the 2035 GPU package' },
  'a.heat_scale': { kind: 'assumption', label: 'Heat lens colour scale runs 0 to 1,500 W/cm2', why: 'Display range only, not a limit; cooling pass or fail comes from the slide 15 rack limits' },
};

/** Look up a source; returns a safe placeholder for unknown ids so the UI never crashes. */
export function source(id) {
  return SOURCES[id] || { kind: 'unknown', label: `Unknown source id: ${id}`, ref: '' };
}
