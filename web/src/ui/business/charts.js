// SVG builders for the business panel: the money-flow Sankey and small line charts.
// Hand-rolled, no libraries. Sizes are SVG user units; the viewBox scales to the card width.
// Colours come from CSS classes in styles/business.css (base.css tokens only).

const NS = 'http://www.w3.org/2000/svg';

const finite = (x) => typeof x === 'number' && Number.isFinite(x);
const r1 = (x) => Math.round(x * 10) / 10;
const safeClass = (id) => String(id).replace(/[^a-zA-Z0-9_-]/g, '');

/** Tiny SVG builder: svg('rect', { x: 1 }, child). */
export function svg(tag, attrs, ...children) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    node.setAttribute(k, String(v));
  }
  for (const c of children.flat()) {
    if (c != null && c !== false) node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

// ---------------------------------------------------------------------------
// Sankey
// ---------------------------------------------------------------------------

const SK = { W: 300, H: 200, top: 18, bottom: 6, nodeW: 8, gap: 14, left: 62, right: 90 };

/** Push label centres apart so neighbouring labels never overlap. */
function spread(items, minGap) {
  items.sort((a, b) => a.y - b.y);
  for (let i = 1; i < items.length; i++) {
    if (items[i].y < items[i - 1].y + minGap) items[i].y = items[i - 1].y + minGap;
  }
}

/**
 * money = { nodes: [{id, label}], links: [{source, target, usd}] } (engine output, never mutated).
 * opts = { fmtUsd(x) -> string, labels: { nodeId: text }, ariaLabel }.
 * Returns an <svg> element, or null when there is nothing to draw.
 * Columns come from the longest path from a source node, so revenue and gap sit left,
 * spend (and profit) in the middle, and the uses on the right.
 */
export function sankey(money, opts = {}) {
  const fmtUsd = opts.fmtUsd || ((x) => String(Math.round(x)));
  const labels = opts.labels || {};
  const meta = {};
  const order = [];
  for (const n of (money && money.nodes) || []) {
    if (n && n.id) { meta[n.id] = n.label || n.id; order.push(n.id); }
  }
  const raw = ((money && money.links) || []).filter((l) => l && finite(l.usd) && l.usd > 0 && l.source && l.target && l.source !== l.target);
  if (!raw.length) return null;

  const nodes = new Map();
  const getNode = (id) => {
    if (!nodes.has(id)) {
      nodes.set(id, { id, label: labels[id] || meta[id] || id, inLinks: [], outLinks: [], inSum: 0, outSum: 0, col: 0, x: 0, y: 0, h: 0, value: 0 });
    }
    return nodes.get(id);
  };
  const links = raw.map((l) => {
    const a = getNode(l.source), b = getNode(l.target);
    const link = { source: l.source, target: l.target, usd: l.usd, a, b, w: 0, sy: 0, ty: 0 };
    a.outLinks.push(link); a.outSum += l.usd;
    b.inLinks.push(link); b.inSum += l.usd;
    return link;
  });
  const list = [...nodes.values()].sort((p, q) => {
    const ip = order.indexOf(p.id), iq = order.indexOf(q.id);
    return (ip < 0 ? 999 : ip) - (iq < 0 ? 999 : iq);
  });
  for (const n of list) n.value = Math.max(n.inSum, n.outSum);

  // Column = longest path from a source node.
  for (let i = 0; i < list.length; i++) {
    for (const l of links) l.b.col = Math.min(list.length, Math.max(l.b.col, l.a.col + 1));
  }
  const cols = [];
  for (const n of list) { (cols[n.col] = cols[n.col] || []).push(n); }
  const maxCol = cols.length - 1;
  if (maxCol < 1) return null;

  // One vertical scale for every column so widths mean the same USD everywhere.
  const availH = SK.H - SK.top - SK.bottom;
  let k = Infinity;
  for (const col of cols) {
    if (!col) continue;
    const sum = col.reduce((a, n) => a + n.value, 0);
    const room = Math.max(availH - (col.length - 1) * SK.gap, 4);
    if (sum > 0) k = Math.min(k, room / sum);
  }
  if (!Number.isFinite(k)) return null;

  const xFor = (c) => SK.left + (SK.W - SK.left - SK.right - SK.nodeW) * (c / maxCol);
  cols.forEach((col, c) => {
    if (!col) return;
    const used = col.reduce((a, n) => a + n.value * k, 0) + (col.length - 1) * SK.gap;
    let y = SK.top + Math.max(0, (availH - used) / 2);
    for (const n of col) { n.x = xFor(c); n.y = y; n.h = n.value * k; y += n.h + SK.gap; }
  });

  for (const l of links) l.w = l.usd * k;
  for (const n of list) {
    n.outLinks.sort((p, q) => p.b.y - q.b.y);
    n.inLinks.sort((p, q) => p.a.y - q.a.y);
    let o = 0;
    for (const l of n.outLinks) { l.sy = n.y + o; o += l.w; }
    let inn = 0;
    for (const l of n.inLinks) { l.ty = n.y + inn; inn += l.w; }
  }

  const root = svg('svg', { class: 'bz-sankey', viewBox: `0 0 ${SK.W} ${SK.H}`, role: 'img', 'aria-label': opts.ariaLabel || 'Money flow, five-year totals' },
    svg('title', {}, opts.ariaLabel || 'Money flow, five-year totals'));

  const gLinks = svg('g', { class: 'bz-links' });
  for (const l of links) {
    const x0 = l.a.x + SK.nodeW, x1 = l.b.x, xm = (x0 + x1) / 2;
    const y0 = l.sy + l.w / 2, y1 = l.ty + l.w / 2;
    gLinks.append(svg('path', {
      class: `bz-link k-${safeClass(l.source === 'spend' ? l.target : l.source)}`,
      d: `M${r1(x0)} ${r1(y0)} C${r1(xm)} ${r1(y0)} ${r1(xm)} ${r1(y1)} ${r1(x1)} ${r1(y1)}`,
      'stroke-width': r1(Math.max(l.w, 0.6)),
      fill: 'none',
    }, svg('title', {}, `${l.a.label} to ${l.b.label}: ${fmtUsd(l.usd)}`)));
  }
  root.append(gLinks);

  const gNodes = svg('g', { class: 'bz-nodes' });
  for (const n of list) {
    gNodes.append(svg('rect', { class: `bz-node k-${safeClass(n.id)}`, x: r1(n.x), y: r1(n.y), width: SK.nodeW, height: r1(Math.max(n.h, 0.8)) },
      svg('title', {}, `${n.label}: ${fmtUsd(n.value)}`)));
  }
  root.append(gNodes);

  const gLabels = svg('g', { class: 'bz-labels' });
  const left = [], right = [], mid = [];
  for (const n of list) {
    const item = { n, y: n.y + n.h / 2 };
    if (n.col === 0) left.push(item);
    else if (n.col === maxCol) right.push(item);
    else mid.push(item);
  }
  spread(left, 21);
  spread(right, 11);
  for (const it of left) {
    gLabels.append(
      svg('text', { class: 'bz-lab', x: r1(it.n.x - 4), y: r1(it.y - 1), 'text-anchor': 'end' }, it.n.label),
      svg('text', { class: 'bz-labv', x: r1(it.n.x - 4), y: r1(it.y + 9), 'text-anchor': 'end' }, fmtUsd(it.n.value)));
  }
  for (const it of right) {
    gLabels.append(svg('text', { class: 'bz-lab', x: r1(it.n.x + SK.nodeW + 4), y: r1(it.y + 3) },
      it.n.label, svg('tspan', { class: 'bz-labv', dx: 3 }, fmtUsd(it.n.value))));
  }
  for (const it of mid) {
    gLabels.append(svg('text', { class: 'bz-lab', x: r1(it.n.x + SK.nodeW / 2), y: r1(it.n.y - 3), 'text-anchor': 'middle' },
      it.n.label, svg('tspan', { class: 'bz-labv', dx: 3 }, fmtUsd(it.n.value))));
  }
  root.append(gLabels);
  return root;
}

// ---------------------------------------------------------------------------
// Line chart
// ---------------------------------------------------------------------------

/**
 * Small line chart that starts at zero.
 * opts = { points: [{x, y|null}], cls, currentX, fmtY(v) -> string, ariaLabel, W, H }.
 * Returns an <svg> element, or null when there are fewer than two points.
 */
export function lineChart(opts = {}) {
  const W = opts.W || 300, H = opts.H || 104;
  const pad = { l: 10, r: 10, t: 16, b: 18 };
  const fmtY = opts.fmtY || ((v) => String(v));
  const pts = (opts.points || []).filter((p) => p && finite(p.x));
  const ys = pts.filter((p) => finite(p.y)).map((p) => p.y);
  if (pts.length < 2 || !ys.length) return null;

  const xs = pts.map((p) => p.x);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMax = Math.max(...ys, 0) || 1;
  const px = (x) => pad.l + (W - pad.l - pad.r) * (xMax > xMin ? (x - xMin) / (xMax - xMin) : 0);
  const py = (y) => H - pad.b - (H - pad.t - pad.b) * (y / yMax);

  const root = svg('svg', { class: `bz-chart ${opts.cls || ''}`.trim(), viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': opts.ariaLabel || 'Line chart' },
    svg('title', {}, opts.ariaLabel || 'Line chart'));

  root.append(svg('line', { class: 'bz-axis', x1: pad.l, x2: W - pad.r, y1: r1(py(0)), y2: r1(py(0)) }));

  const cur = finite(opts.currentX) ? opts.currentX : null;
  if (cur != null && cur >= xMin && cur <= xMax) {
    root.append(svg('line', { class: 'bz-cur', x1: r1(px(cur)), x2: r1(px(cur)), y1: pad.t - 4, y2: r1(py(0)) }));
  }

  let d = '', pen = false;
  for (const p of pts) {
    if (!finite(p.y)) { pen = false; continue; }
    d += `${pen ? 'L' : 'M'}${r1(px(p.x))} ${r1(py(p.y))} `;
    pen = true;
  }
  root.append(svg('path', { class: 'bz-line', d: d.trim(), fill: 'none' }));

  for (const p of pts) {
    if (!finite(p.y)) continue;
    const isCur = cur != null && p.x === cur;
    root.append(svg('circle', { class: isCur ? 'bz-dot cur' : 'bz-dot', cx: r1(px(p.x)), cy: r1(py(p.y)), r: isCur ? 3.6 : 2 },
      svg('title', {}, `${p.x}: ${fmtY(p.y)}`)));
  }

  const valued = pts.filter((p) => finite(p.y));
  const first = valued[0], last = valued[valued.length - 1];
  root.append(svg('text', { class: 'bz-val', x: r1(px(first.x)), y: r1(Math.max(10, py(first.y) - 5)), 'text-anchor': 'start' }, fmtY(first.y)));
  if (last !== first) {
    root.append(svg('text', { class: 'bz-val', x: r1(px(last.x)), y: r1(Math.max(10, py(last.y) - 5)), 'text-anchor': 'end' }, fmtY(last.y)));
  }

  const yl = H - 4;
  root.append(svg('text', { class: 'bz-tick', x: r1(px(xMin)), y: yl, 'text-anchor': 'start' }, xMin));
  root.append(svg('text', { class: 'bz-tick', x: r1(px(xMax)), y: yl, 'text-anchor': 'end' }, xMax));
  if (cur != null && cur > xMin && cur < xMax && px(cur) - px(xMin) > 30 && px(xMax) - px(cur) > 30) {
    root.append(svg('text', { class: 'bz-tick cur', x: r1(px(cur)), y: yl, 'text-anchor': 'middle' }, cur));
  }
  return root;
}
