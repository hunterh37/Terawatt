// The seven cards of the business panel. Each createX(app) returns { root, update(ctx), dispose? }.
// The card shell is built once; update() only replaces the body, so a slider being dragged is never destroyed.
//
// ctx (built in business.js on every render):
//   { app, state, m (metrics), view, level, scenario, catalog, focusSite, projection() }

import { SITE_IDS, OFFWORLD_KINDS } from '../../contract.js';
import { el, fmt, readoutRow, sourceBadge } from '../common.js';
import { sankey, lineChart } from './charts.js';

const PRICE_PATH = 'finance.subUSDPerUserMonth';
const MODEL_PATH = 'finance.revenueModel';
const CV_URL = 'https://cleanview.co/data-centers/us';

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const ro = (label, value, unit, sourceId) => readoutRow({ label, value, unit, sourceId });
const note = (text, cls = '') => el('p', { class: `bz-note ${cls}`.trim() }, text);
const raf = (fn) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fn) : setTimeout(fn, 16));
const caf = (id) => (typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame(id) : clearTimeout(id));

/** Share with no trailing zero when it is a whole percent: 0.1 -> '10%', 0.125 -> '12.5%'. */
function pctAuto(r) {
  if (!isNum(r)) return 'n/a';
  const p = r * 100;
  return fmt.pct(r, Math.abs(p - Math.round(p)) < 1e-9 ? 0 : 1);
}

function isHttp(url) { return typeof url === 'string' && /^https?:\/\//.test(url); }

function linkOrText(text, url) {
  return isHttp(url) ? el('a', { href: url, target: '_blank', rel: 'noopener' }, text) : el('span', {}, text);
}

/** Source id for one catalog field of a site: the field override, else the object source. */
function siteSource(cat, field) { return (cat && (cat[`src_${field}`] || cat.src)) || 's13.rtt'; }

/** One titled card. The body is replaced on every update; the header toggle collapses it. */
function makeCard(id, title, subtitle, open = true) {
  const bodyId = `bz-${id}-body`;
  const body = el('div', { class: 'bz-card-body', id: bodyId });
  const toggle = el('button', { class: 'bz-card-toggle', type: 'button', 'aria-expanded': String(open), 'aria-controls': bodyId },
    el('span', { class: 'bz-card-title' }, title), el('span', { class: 'bz-chev', 'aria-hidden': 'true' }));
  body.hidden = !open;
  toggle.addEventListener('click', () => {
    const nowOpen = body.hidden;
    body.hidden = !nowOpen;
    toggle.setAttribute('aria-expanded', String(nowOpen));
  });
  const root = el('section', { class: `card bz-card bz-${id}`, 'data-section': id },
    el('h3', { class: 'bz-card-h' }, toggle),
    el('p', { class: 'bz-card-sub' }, subtitle),
    body);
  return { root, body };
}

// ---------------------------------------------------------------------------
// 1. Break-even (hero)
// ---------------------------------------------------------------------------

function groupRefs(refs) {
  const byPrice = new Map();
  for (const r of refs) {
    if (!r || !isNum(r.usdPerMonth)) continue;
    if (!byPrice.has(r.usdPerMonth)) byPrice.set(r.usdPerMonth, { price: r.usdPerMonth, names: [], src: r.src || 'ext.sub_price' });
    byPrice.get(r.usdPerMonth).names.push(r.label);
  }
  return [...byPrice.values()].sort((a, b) => a.price - b.price);
}

function compareText(be, groups) {
  if (!isNum(be) || !groups.length) return '';
  const same = groups.find((g) => Math.abs(g.price - be) < 0.005);
  if (same) return `That matches the ${fmt.usd(same.price)} plans sold today.`;
  const below = groups.filter((g) => g.price < be).pop();
  const above = groups.find((g) => g.price > be);
  if (below && above) return `That is above the ${fmt.usd(below.price)} plans and below the ${fmt.usd(above.price)} plans sold today.`;
  if (above) return `That is below even the cheapest plan sold today (${fmt.usd(above.price)}).`;
  return below ? `That is above every plan listed; the dearest is ${fmt.usd(below.price)}.` : '';
}

const legendItem = (cls, label, value, sourceId) => el('li', { class: 'bz-leg' },
  el('span', { class: `bz-sw ${cls}`, 'aria-hidden': 'true' }),
  el('span', { class: 'bz-leg-l' }, label),
  el('b', { class: 'bz-leg-v' }, value),
  sourceId ? sourceBadge(sourceId) : null);

function createHero() {
  const card = makeCard('breakeven', 'Break-even price', 'The monthly price per user that makes this build pay for itself.');
  card.root.classList.add('bz-hero');

  function update(c) {
    const f = c.m.finance || {};
    const be = f.breakevenUSDPerUserMonth;
    const years = c.catalog.challenge.years;
    const refs = (c.catalog.finance && c.catalog.finance.planRefs) || [];
    const groups = groupRefs(refs);
    const mine = f.usdPerUserMonth;
    const tokens = f.revenueModel === 'tokens';
    const kids = [];

    kids.push(el('div', { class: 'bz-big' },
      el('b', {}, isNum(be) ? fmt.usd(be) : 'n/a'),
      el('span', {}, 'per user per month'),
      sourceBadge('a.breakeven')));

    if (isNum(be)) {
      kids.push(el('p', { class: 'bz-lede' },
        `Charge each user this much a month and the build pays for itself within ${years} years, with future money discounted at ${pctAuto(f.discountRate)} a year. `,
        sourceBadge('a.discount')));
      const cmp = compareText(be, groups);
      if (cmp) kids.push(el('p', { class: 'bz-lede' }, cmp, sourceBadge('ext.sub_price')));
    } else {
      kids.push(note('No users are served yet, so there is no break-even price. Add racks or switch a site on.'));
    }

    // Horizontal scale: break-even bar, your revenue per user, and the plan prices.
    const vals = [isNum(be) ? be : 0, isNum(mine) ? mine : 0, ...groups.map((g) => g.price)];
    const maxV = (Math.max(...vals) * 1.08) || 1;
    const pos = (v) => `${Math.min(100, Math.max(0, (v / maxV) * 100)).toFixed(1)}%`;
    const track = el('div', { class: 'bz-scale', role: 'img', 'aria-label': 'Price scale with break-even, your price and the plans sold today' },
      el('div', { class: 'bz-scale-bar' }));
    for (const g of groups) {
      track.append(el('span', { class: 'bz-mark ref', style: { left: pos(g.price) }, title: `${g.names.join(', ')}: ${fmt.usd(g.price)}` }));
    }
    if (isNum(mine)) track.append(el('span', { class: 'bz-mark mine', style: { left: pos(mine) }, title: `Your revenue per user: ${fmt.usd(mine)}` }));
    if (isNum(be)) track.append(el('span', { class: 'bz-mark be', style: { left: pos(be) }, title: `Break-even: ${fmt.usd(be)}` }));
    kids.push(track);

    const legend = el('ul', { class: 'bz-legend' });
    if (isNum(be)) legend.append(legendItem('be', 'Break-even', fmt.usd(be), 'a.breakeven'));
    if (isNum(mine)) legend.append(legendItem('mine', tokens ? 'Revenue per user (token prices)' : 'Your price', fmt.usd(mine), tokens ? 'a.revenue_model' : 'ext.sub_price'));
    for (const g of groups) legend.append(legendItem('ref', g.names.join(', '), fmt.usd(g.price), g.src));
    kids.push(legend);

    if (isNum(mine)) {
      const pays = f.paybackYears != null ? `pays back in ${fmt.years(f.paybackYears)}` : `does not pay back within ${years} years`;
      kids.push(el('p', { class: 'bz-lede' }, `At ${fmt.usd(mine)} per user per month the build ${pays}.`, sourceBadge('d.finance')));
    }
    card.body.replaceChildren(...kids);
  }
  return { root: card.root, update };
}

// ---------------------------------------------------------------------------
// 2. Returns (with the subscription-price slider)
// ---------------------------------------------------------------------------

function createPriceSlider(app) {
  const def = ((app.engine && app.engine.PARAMS) || []).find((p) => p.path === PRICE_PATH) || null;
  const inputId = 'bz-price-input';
  let pending = null, dragging = false, frame = 0;

  const out = el('output', { class: 'bz-slider-out', for: inputId });
  const attrs = { id: inputId, type: 'range', 'aria-label': 'Subscription price per user per month' };
  if (def) { attrs.min = def.min; attrs.max = def.max; attrs.step = def.step; } else { attrs.min = 1; attrs.max = 500; attrs.step = 1; }
  const input = el('input', attrs);
  const rangeRow = def ? el('div', { class: 'bz-slider-range' }, el('span', {}, fmt.usd(def.min)), el('span', {}, fmt.usd(def.max))) : null;
  const modelNote = el('div', { class: 'bz-model-note' });
  modelNote.hidden = true;

  const priceText = (v) => `${fmt.usd(v)} per user per month`;
  const push = () => {
    frame = 0;
    if (pending == null) return;
    const v = pending;
    pending = null;
    if (typeof app.setParam === 'function') app.setParam(PRICE_PATH, v);
  };
  input.addEventListener('input', () => {
    const v = Number(input.value);
    if (!Number.isFinite(v)) return;
    pending = v;
    out.textContent = priceText(v);
    if (!frame) frame = raf(push);
  });
  input.addEventListener('pointerdown', () => {
    dragging = true;
    const up = () => {
      dragging = false;
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  });

  const root = el('div', { class: 'bz-slider' },
    el('div', { class: 'bz-slider-top' },
      el('label', { for: inputId }, 'Subscription price'),
      sourceBadge('ext.sub_price'),
      out),
    input, rangeRow, modelNote);

  function update(c) {
    const f = c.m.finance || {};
    const tokens = f.revenueModel === 'tokens';
    const price = c.scenario && c.scenario.finance ? c.scenario.finance.subUSDPerUserMonth : null;
    if (isNum(price) && pending == null && !dragging) {
      input.value = String(price);
      out.textContent = priceText(price);
    }
    input.disabled = tokens;
    root.classList.toggle('is-off', tokens);
    modelNote.hidden = !tokens;
    if (tokens) {
      modelNote.replaceChildren(
        'Revenue now comes from per-token prices, so this price is not used. ',
        el('button', { class: 'btn bz-mini', type: 'button', onclick: () => { if (typeof app.setParam === 'function') app.setParam(MODEL_PATH, 'subscription'); } }, 'Use subscription pricing'));
    }
  }
  function dispose() { if (frame) caf(frame); frame = 0; pending = null; }
  return { root, update, dispose };
}

function createReturns(app) {
  const card = makeCard('returns', 'Returns', 'Does it make money? Drag the price and watch NPV and IRR move.');
  const slider = createPriceSlider(app);
  const dyn = el('div', { class: 'bz-dyn' });
  card.body.append(slider.root, dyn);

  function update(c) {
    slider.update(c);
    const f = c.m.finance || {};
    const t = c.m.totals || {};
    const model = f.revenueModel === 'tokens' ? 'API price per token' : 'Subscription per user';
    const npvRow = ro('NPV', fmt.usd(f.npvUSD), '', 'd.finance');
    const npvVal = npvRow.querySelector('.ro-value');
    if (npvVal && isNum(f.npvUSD)) npvVal.classList.add(f.npvUSD >= 0 ? 'bz-pos' : 'bz-neg');
    const irrText = f.irrLabel || (isNum(f.irr) ? fmt.pct(f.irr, 1) : 'n/a');
    dyn.replaceChildren(
      npvRow,
      ro('IRR', irrText, '', 'd.finance'),
      ro('Payback', fmt.years(f.paybackYears), '', 'd.finance'),
      ro('Capex (year 0)', fmt.usd(f.capexUSD), '', 'd.finance'),
      ro('Opex', fmt.usd(f.opexUSDPerYear), 'per year', 'd.finance'),
      ro('Revenue', fmt.usd(f.revenueUSDPerYear), 'per year', 'a.revenue_model'),
      ro('Revenue model', model, '', 'a.revenue_model'),
      ro('Discount rate', pctAuto(f.discountRate), 'per year', 'a.discount'),
      ro('Users served', fmt.short(t.usersServed), '', 'd.demand'),
      note('NPV (net present value) is what five years of profit is worth today, minus the build cost. IRR (internal rate of return) is the yearly return that would make NPV zero.', 'bz-gloss'));
  }
  return { root: card.root, update, dispose: slider.dispose };
}

// ---------------------------------------------------------------------------
// 3. Money flow
// ---------------------------------------------------------------------------

function createMoney() {
  const card = makeCard('money', 'Money flow', 'Where five years of money comes from and where it goes.');

  function update(c) {
    const money = c.m.money;
    const years = c.catalog.challenge.years;
    const chart = sankey(money, {
      fmtUsd: (x) => fmt.usd(x),
      labels: { revenue: 'Revenue' },
      ariaLabel: `Money flow over ${years} years: revenue and funding gap into spend, spend into racks, buildings, launches, energy, carbon and operations`,
    });
    if (!chart) { card.body.replaceChildren(note('No money moves yet. Add racks to a site to see the flow.')); return; }
    const links = (money && money.links) || [];
    const sum = (pred) => links.filter(pred).reduce((a, l) => a + (isNum(l.usd) ? l.usd : 0), 0);
    const gap = sum((l) => l.source === 'gap');
    const revToSpend = sum((l) => l.source === 'revenue' && l.target === 'spend');
    const spend = revToSpend + gap;
    const profit = sum((l) => l.target === 'profit');
    const caption = gap > 0
      ? `Revenue pays for ${fmt.usd(revToSpend)} of the ${fmt.usd(spend)} spent over ${years} years. The other ${fmt.usd(gap)} is a funding gap.`
      : `Revenue covers all ${fmt.usd(spend)} spent over ${years} years and leaves ${fmt.usd(profit)} of profit.`;
    card.body.replaceChildren(
      chart,
      el('p', { class: 'bz-lede' }, caption, sourceBadge('d.sankey')),
      note('Band widths are proportional to USD. Totals are for the whole period, not per year.'));
  }
  return { root: card.root, update };
}

// ---------------------------------------------------------------------------
// 4. Site constraints
// ---------------------------------------------------------------------------

const STANCE = { support: 'Supports', mixed: 'Mixed', oppose: 'Opposes' };

const chip = (label, value, sourceId) => el('span', { class: 'bz-chip' },
  el('span', { class: 'bz-chip-l' }, label), el('b', {}, value), sourceId ? sourceBadge(sourceId) : null);

function existingList(c) { return (c.app.data && c.app.data.existingDCs) || []; }

function sentimentItems(c, id, m) {
  if (m.sentiment && m.sentiment.items && m.sentiment.items.length) return m.sentiment.items;
  return (c.app.data && c.app.data.sentiment && c.app.data.sentiment[id]) || [];
}

function sentimentNodes(c, id, m) {
  const label = (m.sentiment && m.sentiment.label) || 'No coverage found';
  const out = [ro('Local sentiment', label, '', 'ext.sentiment')];
  for (const it of sentimentItems(c, id, m)) {
    out.push(el('div', { class: `bz-news stance-${it.stance || 'mixed'}` },
      el('span', { class: 'bz-stance' }, STANCE[it.stance] || it.stance || ''),
      linkOrText(it.headline || 'Article', it.url),
      el('span', { class: 'bz-news-meta' }, [it.publisher, it.date].filter(Boolean).join(', '))));
  }
  return out;
}

function neighbours(c, id) {
  const near = existingList(c).filter((d) => d.nearSite === id);
  if (!near.length) return [note('No known AI campus near this site in our list.')];
  const ul = el('ul', { class: 'bz-camp' });
  for (const d of near) {
    ul.append(el('li', {},
      linkOrText(d.name, d.url),
      el('span', { class: 'bz-mw' }, `${fmt.mw(d.mw)}${d.mwNote ? `, ${d.mwNote}` : ''}`),
      sourceBadge('ext.existing')));
  }
  return [el('div', { class: 'bz-sub' }, 'Existing campuses nearby'), ul];
}

const carbonText = (v) => fmt.num(v, isNum(v) && v < 100 ? 1 : 0);

function earthDetail(c, id, m) {
  const cat = (c.catalog.sites && c.catalog.sites[id]) || {};
  const cool = (c.catalog.cooling && c.catalog.cooling[m.cooling]) || {};
  const mult = c.scenario && c.scenario.energyPriceMult;
  const priceUnit = isNum(mult) && Math.abs(mult - 1) > 1e-9 ? `per MWh, x${mult}` : 'per MWh';
  return [
    ro('Energy price', fmt.usd(m.priceUSDPerMWh), priceUnit, siteSource(cat, 'priceUSDPerMWh')),
    ro('Carbon', carbonText(m.carbonKgPerMWh), 'kg CO2 per MWh', siteSource(cat, 'carbonKgPerMWh')),
    ro('Climate', fmt.c(m.tempC), 'annual mean', siteSource(cat, 'tempC')),
    ro(`PUE (${cool.label || m.cooling})`, fmt.num(m.pue, 2), '', 's15.pue'),
    ro('Water use', fmt.ml(m.waterMLPerYear), 'per year', 'd.water'),
    m.waterStress && m.waterStress.label
      ? ro('Water stress', m.waterStress.label, '', 'd.water')
      : ro('Water stress', 'not retrieved', '', 'a.water_rule'),
    ro('Round trip to users', fmt.ms(m.rttMs), '', 's13.rtt'),
    ...sentimentNodes(c, id, m),
    ...neighbours(c, id),
  ];
}

function offworldDetail(c, id, m) {
  const cat = (c.catalog.sites && c.catalog.sites[id]) || {};
  const rows = [
    ro('IT power', fmt.mw(m.itMW), '', 'd.facility'),
    ro('Launch mass', fmt.t(m.launchMassT), '', 'd.launch'),
    ro('Launch cost', fmt.usd(m.launchUSD), '', 'd.launch'),
    ro('Launch cost multiplier', isNum(cat.launchMult) ? `${fmt.num(cat.launchMult)}x LEO` : 'n/a', '', siteSource(cat, 'launchMult')),
    ro('Radiator area', fmt.num(m.radiatorM2), 'm2', 'd.radiator'),
    ro('Round trip to users', fmt.ms(m.rttMs), '', 's13.rtt'),
    ro('Interactive chat and agents', m.servesInteractive ? 'yes' : 'background only', '', 'a.interactive_split'),
    ...sentimentNodes(c, id, m),
  ];
  if (!m.enabled) rows.unshift(note('Switched off in the scenario, so these numbers are zero. Turn it on under Off-world.', 'bz-warn'));
  return rows;
}

function siteDetail(c, id) {
  const m = c.m.sites && c.m.sites[id];
  if (!m) return [note('No data for this site.')];
  const earth = m.kind === 'earth';
  const cat = (c.catalog.sites && c.catalog.sites[id]) || {};
  const head = el('div', { class: 'bz-sitehead' },
    el('div', {}, el('b', {}, m.name), earth && cat.place ? el('span', { class: 'bz-place' }, cat.place) : null),
    el('button', { class: 'btn bz-mini', type: 'button', onclick: () => c.app.goTo(earth ? 'fleet' : 'offworld') }, earth ? 'All sites' : 'Off-world'));
  const kids = [head];
  if (earth && !m.enabled) kids.push(note('This site is switched off in the scenario. It shows its fixed numbers but holds no racks.', 'bz-warn'));
  kids.push(...(earth ? earthDetail(c, id, m) : offworldDetail(c, id, m)));
  return kids;
}

function siteBlockHead(c, id, m) {
  return el('div', { class: 'bz-site-top' },
    el('button', { class: 'bz-site-btn', type: 'button', onclick: () => c.app.goTo('site', { site: id }) }, m.name),
    m.enabled ? null : el('span', { class: 'bz-tag' }, 'off'),
    el('span', { class: 'bz-chip-l' }, 'Round trip'), el('b', {}, fmt.ms(m.rttMs)), sourceBadge('s13.rtt'));
}

function earthTable(c) {
  const blocks = [];
  for (const id of SITE_IDS) {
    const m = c.m.sites && c.m.sites[id];
    if (!m) continue;
    const cat = (c.catalog.sites && c.catalog.sites[id]) || {};
    blocks.push(el('div', { class: `bz-site${m.enabled ? '' : ' is-off'}` },
      siteBlockHead(c, id, m),
      el('div', { class: 'bz-chips' },
        chip('Power', `${fmt.usd(m.priceUSDPerMWh)}/MWh`, siteSource(cat, 'priceUSDPerMWh')),
        chip('Carbon', `${carbonText(m.carbonKgPerMWh)} kg/MWh`, siteSource(cat, 'carbonKgPerMWh')),
        chip('PUE', fmt.num(m.pue, 2), 's15.pue'),
        chip('Water', fmt.ml(m.waterMLPerYear), 'd.water'),
        chip('Local view', (m.sentiment && m.sentiment.label) || 'No coverage found', 'ext.sentiment'))));
  }
  return [note('Tap a site to see its constraints and its neighbours.'), ...blocks];
}

function offworldTable(c) {
  const blocks = [];
  for (const id of OFFWORLD_KINDS) {
    const m = c.m.sites && c.m.sites[id];
    if (!m) continue;
    blocks.push(el('div', { class: `bz-site${m.enabled ? '' : ' is-off'}` },
      siteBlockHead(c, id, m),
      el('div', { class: 'bz-chips' },
        chip('IT power', fmt.mw(m.itMW), 'd.facility'),
        chip('Launch mass', fmt.t(m.launchMassT), 'd.launch'),
        chip('Launch cost', fmt.usd(m.launchUSD), 'd.launch'),
        chip('Radiators', `${fmt.num(m.radiatorM2)} m2`, 'd.radiator'))));
  }
  return [note('Tap a place to see its numbers.'), ...blocks];
}

function createConstraints() {
  const card = makeCard('constraints', 'Site constraints', 'What the place gives you: power price, carbon, water and neighbours.');

  function update(c) {
    const id = c.focusSite;
    const known = id && c.m.sites && c.m.sites[id];
    let kids;
    if (c.level === 'site' && known) kids = siteDetail(c, id);
    else if (c.level === 'offworld') kids = offworldTable(c);
    else kids = earthTable(c);
    card.body.replaceChildren(...kids);
  }
  return { root: card.root, update };
}

// ---------------------------------------------------------------------------
// 5. Facility size
// ---------------------------------------------------------------------------

function chipsAtSite(m, racksForYear) {
  const R = racksForYear || {};
  const per = (type) => (R[type] && isNum(R[type].chips) ? R[type].chips : 0);
  const rt = m.rackType || {};
  const rk = m.racks || {};
  return (rk.prefill || 0) * per(rt.prefill) + (rk.decode || 0) * per(rt.decode);
}

function createFacility() {
  const card = makeCard('facility', 'Facility size', 'How big the buildings have to be.');

  function update(c) {
    const hallRacks = c.catalog.facility && c.catalog.facility.hallRacks;
    const hallUnit = isNum(hallRacks) ? `of up to ${fmt.num(hallRacks)} racks` : '';
    const id = c.focusSite;
    const m = id && c.m.sites ? c.m.sites[id] : null;
    const rows = [];
    if (c.level === 'site' && m) {
      const earth = m.kind === 'earth';
      const rk = m.racks || {};
      rows.push(el('div', { class: 'bz-sub' }, m.name));
      rows.push(ro('Facility power', fmt.mw(m.facilityMW), '', 'd.facility'));
      rows.push(ro('IT power', fmt.mw(m.itMW), '', 'd.facility'));
      if (earth) rows.push(ro('Share of grid', fmt.mw(m.allocMW), '', 'a.alloc'));
      rows.push(ro('Racks', fmt.num((rk.prefill || 0) + (rk.decode || 0)), `(${fmt.num(rk.prefill || 0)} prefill, ${fmt.num(rk.decode || 0)} decode)`, 'd.capacity'));
      if (earth) {
        rows.push(ro('Halls', fmt.num(m.halls), hallUnit, 'a.hall_racks'));
        rows.push(ro('Buildings', fmt.num(m.halls > 0 ? 1 : 0), '', 'a.hall_racks'));
      }
      rows.push(ro('Chips', fmt.short(chipsAtSite(m, c.m.racksForYear)), '', 's12.racks'));
    } else {
      const t = c.m.totals || {};
      const earthSites = Object.values(c.m.sites || {}).filter((s) => s && s.kind === 'earth');
      const halls = earthSites.reduce((a, s) => a + (isNum(s.halls) ? s.halls : 0), 0);
      const buildings = earthSites.filter((s) => s.halls > 0).length;
      const racks = t.racks || {};
      rows.push(el('div', { class: 'bz-sub' }, 'All sites together'));
      rows.push(ro('Facility power', fmt.mw(t.facilityMW), '', 'd.facility'));
      rows.push(ro('Earth facility power', fmt.mw(t.earthFacilityMW), `of ${fmt.mw(t.gridCapMW)} grid`, 'd.facility'));
      rows.push(ro('Off-world IT power', fmt.mw(t.offworldITMW), '', 'd.placement'));
      rows.push(ro('IT power', fmt.mw(t.itMW), '', 'd.facility'));
      rows.push(ro('Racks', fmt.num(racks.total), `(${fmt.num(racks.prefill)} prefill, ${fmt.num(racks.decode)} decode)`, 'd.capacity'));
      rows.push(ro('Halls', fmt.num(halls), hallUnit, 'a.hall_racks'));
      rows.push(ro('Buildings', fmt.num(buildings), '', 'a.hall_racks'));
      rows.push(ro('Chips', fmt.short(t.chips), '', 's12.racks'));
    }
    rows.push(note('Prefill racks read the prompt; decode racks write the answer. Geometry in the 3D view is schematic, not to scale.', 'bz-gloss'));
    card.body.replaceChildren(...rows);
  }
  return { root: card.root, update };
}

// ---------------------------------------------------------------------------
// 6. 2025 to 2035 projection
// ---------------------------------------------------------------------------

function createProjection() {
  const card = makeCard('projection', '2025 to 2035', 'How many racks, and how much energy per token, the same demand needs each year.');

  function update(c) {
    const pts = typeof c.projection === 'function' ? c.projection() : null;
    if (!pts || !pts.length) { card.body.replaceChildren(note('The projection is not available right now.')); return; }
    const cur = c.scenario ? c.scenario.year : null;
    const racks = lineChart({
      points: pts.map((p) => ({ x: p.year, y: p.racks })), cls: 'racks', currentX: cur,
      fmtY: (v) => fmt.num(v), ariaLabel: 'Racks needed to serve all demand, by year',
    });
    const joules = lineChart({
      points: pts.map((p) => ({ x: p.year, y: p.jPerOutputToken })), cls: 'joules', currentX: cur,
      fmtY: (v) => fmt.j(v), ariaLabel: 'Joules per output token, by year',
    });
    const a = pts[0], z = pts[pts.length - 1];
    card.body.replaceChildren(
      el('div', { class: 'bz-chart-title' }, 'Racks needed', sourceBadge('d.projection')),
      racks || note('No racks series.'),
      el('div', { class: 'bz-chart-title' }, 'Energy per output token', sourceBadge('d.jtoken')),
      joules || note('No energy series.'),
      el('p', { class: 'bz-lede' },
        `In ${a.year} the same demand needs ${fmt.num(a.racks)} racks at ${fmt.j(a.jPerOutputToken)} per output token. In ${z.year}: ${fmt.num(z.racks)} racks at ${fmt.j(z.jPerOutputToken)}.`,
        sourceBadge('d.projection')),
      note('Each year is re-sized to serve all demand with that year\'s racks; the grid cap is not enforced here. Charts start at zero. The dashed line is the year slider.'));
  }
  return { root: card.root, update };
}

// ---------------------------------------------------------------------------
// 7. Existing data centers
// ---------------------------------------------------------------------------

function createExisting() {
  const card = makeCard('existing', 'Existing data centers', 'Who has already built or announced AI campuses.');
  let campusOpen = false;

  function update(c) {
    const cv = (c.app.data && c.app.data.cleanview) || {};
    const t = cv.totals || c.catalog.cleanview || {};
    const url = (c.app.sources && c.app.sources['cv.map'] && c.app.sources['cv.map'].url) || CV_URL;
    const markers = Array.isArray(cv.markers) ? cv.markers : null;
    const campuses = existingList(c);

    const kids = [
      ro('US operating (with MW)', fmt.num(t.operatingCount), `centers, ${fmt.mw(t.operatingMW)}`, 'cv.map'),
      ro('US planned (with MW)', fmt.num(t.plannedCount), `centers, ${fmt.mw(t.plannedMW)}`, 'cv.map'),
      ro('US canceled', fmt.num(t.canceledCount), 'centers', 'cv.map'),
      el('p', { class: 'bz-credit' }, 'Source: ', el('a', { href: url, target: '_blank', rel: 'noopener' }, 'Cleanview'), ' (US data center map).', sourceBadge('cv.map')),
      markers
        ? note(`${fmt.num(markers.length)} Cleanview markers are drawn on the globe: operating and planned in different colours.`)
        : note('The map markers are not included in this public build, so only the totals are shown.'),
    ];

    if (campuses.length) {
      const ul = el('ul', { class: 'bz-camp' });
      for (const d of campuses) {
        ul.append(el('li', {},
          linkOrText(d.name, d.url),
          el('span', { class: 'bz-mw' }, `${fmt.mw(d.mw)}${d.mwNote ? `, ${d.mwNote}` : ''}${d.status ? `, ${d.status}` : ''}`),
          sourceBadge('ext.existing')));
      }
      const details = el('details', { class: 'bz-details', open: campusOpen },
        el('summary', {}, `Known AI campuses (${fmt.num(campuses.length)})`), ul);
      details.addEventListener('toggle', () => { campusOpen = details.open; });
      kids.push(details);
    }
    card.body.replaceChildren(...kids);
  }
  return { root: card.root, update };
}

/** All cards in display order. */
export function createSections(app) {
  return [
    { id: 'breakeven', ...createHero() },
    { id: 'returns', ...createReturns(app) },
    { id: 'money', ...createMoney() },
    { id: 'constraints', ...createConstraints() },
    { id: 'facility', ...createFacility() },
    { id: 'projection', ...createProjection() },
    { id: 'existing', ...createExisting() },
  ];
}
