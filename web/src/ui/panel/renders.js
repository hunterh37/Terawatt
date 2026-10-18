// Level card pictures: renders of the matching props built for the Terawatt visionOS app, from
// RealityHD (github.com/hunterh37/RealityHD, MIT, see assets/realityhd/LICENSE). Pictures only:
// every number on the card still comes from the engine and names its source.

const REPO = 'https://github.com/hunterh37/RealityHD';

/** id -> [label, alt]; ids match assets/realityhd/<id>.jpg and the RealityHD prop ids. */
const PICS = {
  'rack-ai-1mw': ['2035 GPU rack', 'A tall black rack packed with compute trays'],
  'rack-lpu': ['LPU decode rack', 'A tall black rack of LPU trays'],
  'rack-air-42u': ['Air-card rack', 'A white 42U rack of air-cooled cards'],
  'rack-nvl72-2025': ['GB200 NVL72 rack (2025)', 'A black GB200 NVL72 rack'],
  'chip-package-final': ['Chip package', 'Compute dies on a green substrate with the lid lifted'],
  'orbital-dc-module': ['Orbital module', 'A white pressurised module inside a truss frame'],
};

/** The rack on screen: same pool and type rule as levels/rack.js. Before 2027 the GPU line is the NVL72. */
function rackPic(state) {
  const focus = (state.view && state.view.focus) || {};
  const pool = focus.rack === 'prefill' ? 'prefill' : 'decode';
  const sc = state.scenario && state.scenario.pools && state.scenario.pools[pool];
  const sm = state.metrics && state.metrics.sites && state.metrics.sites[focus.site || 'wtx'];
  const type = (sc && sc.type) || (sm && sm.rackType && sm.rackType[pool]) || 'gpu';
  if (type === 'lpu') return 'rack-lpu';
  if (type === 'air') return 'rack-air-42u';
  return state.scenario && state.scenario.year < 2027 ? 'rack-nvl72-2025' : 'rack-ai-1mw';
}

/** { id, src, label, alt, href } for the current level, or null when no prop matches it. */
export function renderFor(state) {
  const level = state && state.view && state.view.level;
  const id = level === 'rack' ? rackPic(state) : level === 'chip' ? 'chip-package-final' : level === 'offworld' ? 'orbital-dc-module' : null;
  if (!id) return null;
  const [label, alt] = PICS[id];
  return { id, src: `assets/realityhd/${id}.jpg`, label, alt, href: REPO };
}
