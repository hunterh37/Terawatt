// Discounted cash flow helpers. cashflows[0] is year 0 (usually negative capex).

export function npv(rate, cashflows) {
  return cashflows.reduce((acc, cf, t) => acc + cf / Math.pow(1 + rate, t), 0);
}

/** Internal rate of return by bisection. Returns null when no sign change exists. */
export function irr(cashflows, lo = -0.99, hi = 10) {
  const f = (r) => npv(r, cashflows);
  let flo = f(lo), fhi = f(hi);
  if (!Number.isFinite(flo) || !Number.isFinite(fhi) || flo * fhi > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2, fm = f(mid);
    if (Math.abs(fm) < 1e-9 * Math.max(1, Math.abs(cashflows[0]))) return mid;
    if (flo * fm < 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
  }
  return (lo + hi) / 2;
}

/** Years until cumulative cash turns non-negative, interpolated within the year. null if never. */
export function paybackYears(cashflows) {
  let cum = cashflows[0];
  if (cum >= 0) return 0;
  for (let t = 1; t < cashflows.length; t++) {
    const next = cum + cashflows[t];
    if (next >= 0) return t - 1 + (-cum / cashflows[t]);
    cum = next;
  }
  return null;
}
