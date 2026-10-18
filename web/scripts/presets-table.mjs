// Runs every preset through the engine and writes test-results/presets.json, the anchor for every engine
// figure quoted in README.md and the PRD. Run: node scripts/presets-table.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { PRESETS, derive } from '../src/engine/engine.js';
import { SENTIMENT } from '../src/data/sentiment.js';

const rows = Object.entries(PRESETS).map(([id, p]) => {
  const s = p.make(), m = derive(s, { sentiment: SENTIMENT }), t = m.totals, f = m.finance;
  return {
    id, label: p.label, year: m.year, racks: t.racks.total, prefillRacks: t.racks.prefill, decodeRacks: t.racks.decode, chips: t.chips, itMW: t.itMW, earthFacilityMW: t.earthFacilityMW,
    gridCapMW: t.gridCapMW, offworldITMW: t.offworldITMW, cost5yrUSD: t.cost5yrUSD, budgetUSD: t.budgetUSD,
    servedShare: t.served.overall, servedInteractive: t.served.interactive, servedBackground: t.served.background, usersServed: t.usersServed, users: t.demand.users, jPerOutputToken: t.jPerOutputToken, pueBlended: t.pueBlended,
    waterMLPerYear: t.waterMLPerYear, carbonTPerYear: t.carbonTPerYear,
    revenueModel: f.revenueModel, usdPerUserMonth: f.usdPerUserMonth, npvUSD: f.npvUSD, irr: f.irr, irrLabel: f.irrLabel,
    paybackYears: f.paybackYears, breakevenUSDPerUserMonth: f.breakevenUSDPerUserMonth,
    checks: m.checks.map((c) => ({ id: c.id, ok: c.ok, severity: c.severity, msg: c.msg, cause: c.cause })),
    firstFailing: m.firstFailing ? { id: m.firstFailing.id, msg: m.firstFailing.msg, cause: m.firstFailing.cause } : null,
  };
});
mkdirSync(new URL('../test-results/', import.meta.url), { recursive: true });
writeFileSync(new URL('../test-results/presets.json', import.meta.url), JSON.stringify(rows, null, 1));
const n = (v, d = 0) => (v == null || !Number.isFinite(v) ? 'n/a' : v.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d }));
console.log('| Preset | Racks | Earth facility MW | Orbit IT MW | 5-year cost $B | Served | J per output token | Break-even $/user/mo | NPV $B at $20 | First failing |');
for (const r of rows) console.log(`| ${r.id} | ${n(r.racks)} | ${n(r.earthFacilityMW)} | ${n(r.offworldITMW)} | ${n(r.cost5yrUSD / 1e9, 1)} | ${n(r.servedShare * 100)}% | ${n(r.jPerOutputToken, 2)} | ${n(r.breakevenUSDPerUserMonth, 2)} | ${n(r.npvUSD / 1e9, 1)} | ${r.firstFailing ? r.firstFailing.id : 'none'} |`);
