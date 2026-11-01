// Discounted cash flow valuation. Pure: no imports, no network.
// Free cash flow to the firm is discounted at WACC, end-of-year timing, with a Gordon growth
// terminal value. The answer is only as good as the discount rate and terminal growth you
// choose, so callers should show a sensitivity grid and a range, never a single "target".

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// Starting assumptions read from the latest year of statements. Each one is shown to the user and editable.
// `s` is summarize(base year), `cf` is that year's cash flow statement (or null), `taxRate` comes from the planner.
export function valuationDefaults(s, cf, { taxRate, growth } = {}) {
  const notes = [];
  const sales = s.sales;
  const capexKnown = cf && isNum(cf.capex);
  if (!capexKnown) notes.push('Capital expenditure was not found, so capex is set equal to depreciation. Edit it if you know better.');
  const nwc = s.receivables + s.inventory + s.otherCurrentAssets - s.payables - s.otherCurrentLiabilities;
  const rate = isNum(taxRate) ? taxRate : 0.21;
  return {
    baseSales: sales,
    years: 5,
    growthStart: isNum(growth) ? growth : 0.08,
    growthTerminal: 0.025,
    ebitMargin: sales > 0 ? s.ebit / sales : 0,
    taxRate: clamp(rate, 0, 0.35),
    daPct: sales > 0 ? s.depreciation / sales : 0,
    capexPct: sales > 0 ? (capexKnown ? cf.capex : s.depreciation) / sales : 0,
    nwcPct: sales > 0 ? nwc / sales : 0,
    wacc: 0.09,
    notes,
  };
}

// Growth fades in a straight line from growthStart in year 1 to growthTerminal in the last year.
export function projectUfcf(a) {
  const n = Math.max(1, Math.round(a.years));
  const rows = [];
  let prev = a.baseSales;
  for (let t = 1; t <= n; t++) {
    const g = n === 1 ? a.growthStart : a.growthStart + (a.growthTerminal - a.growthStart) * ((t - 1) / (n - 1));
    const sales = prev * (1 + g);
    const ebit = sales * a.ebitMargin;
    const nopat = ebit * (1 - a.taxRate);
    const da = sales * a.daPct;
    const capex = sales * a.capexPct;
    const dNwc = (sales - prev) * a.nwcPct;
    rows.push({ t, g, sales, ebit, nopat, da, capex, dNwc, ufcf: nopat + da - capex - dNwc });
    prev = sales;
  }
  return rows;
}

// Present value of the explicit cash flows plus a Gordon growth terminal value at the end of the last year.
export function dcf(ufcfs, wacc, g) {
  if (!(wacc > g)) return { error: 'The discount rate must be higher than terminal growth.' };
  const n = ufcfs.length;
  let pvFcf = 0;
  const pv = ufcfs.map((f, i) => { const p = f / Math.pow(1 + wacc, i + 1); pvFcf += p; return p; });
  const tv = (ufcfs[n - 1] * (1 + g)) / (wacc - g);
  const pvTv = tv / Math.pow(1 + wacc, n);
  const ev = pvFcf + pvTv;
  return { pv, pvFcf, tv, pvTv, ev, tvShare: ev !== 0 ? pvTv / ev : null };
}

export function rating(upside, band = 0.15) {
  if (!isNum(upside)) return null;
  return upside >= band ? 'Buy' : upside <= -band ? 'Sell' : 'Hold';
}

// Full valuation. `bridge` = { cash, debt, shares, price }. Shares and price are optional.
export function value(a, bridge) {
  const rows = projectUfcf(a);
  const d = dcf(rows.map((r) => r.ufcf), a.wacc, a.growthTerminal);
  if (d.error) return { error: d.error, rows };
  const netDebt = bridge.debt - bridge.cash;
  const equity = d.ev - netDebt;
  const perShare = isNum(bridge.shares) && bridge.shares > 0 ? equity / bridge.shares : null;
  const upside = perShare !== null && isNum(bridge.price) && bridge.price > 0 ? perShare / bridge.price - 1 : null;
  return { rows, ...d, netDebt, equity, perShare, upside, rating: rating(upside) };
}

// Value per share (or equity value when shares are unknown) across discount rates and terminal growth rates.
export function sensitivity(a, bridge, { waccSteps = [-0.02, -0.01, 0, 0.01, 0.02], gSteps = [-0.01, -0.005, 0, 0.005, 0.01] } = {}) {
  const waccs = waccSteps.map((x) => a.wacc + x);
  const gs = gSteps.map((x) => a.growthTerminal + x);
  const cells = waccs.map((w) => gs.map((g) => {
    const v = value({ ...a, wacc: w, growthTerminal: g }, bridge);
    if (v.error) return null;
    return v.perShare !== null ? v.perShare : v.equity;
  }));
  return { waccs, gs, cells, perShare: isNum(bridge.shares) && bridge.shares > 0 };
}

// Value across a wide grid of discount rates and terminal growth rates, for the 3D surface.
// Cells where the discount rate is within `minGap` of growth are left null: the formula explodes there and means nothing.
export function valueSurface(a, bridge, { n = 33, waccSpan = 0.025, gSpan = 0.015, minGap = 0.015 } = {}) {
  const waccs = Array.from({ length: n }, (_, i) => a.wacc - waccSpan + (2 * waccSpan * i) / (n - 1));
  const gs = Array.from({ length: n }, (_, j) => a.growthTerminal - gSpan + (2 * gSpan * j) / (n - 1));
  const perShare = isNum(bridge.shares) && bridge.shares > 0;
  const z = waccs.map((w) => gs.map((g) => {
    if (w - g < minGap) return null;
    const v = value({ ...a, wacc: w, growthTerminal: g }, bridge);
    if (v.error) return null;
    const out = perShare ? v.perShare : v.equity;
    return isNum(out) ? out : null;
  }));
  return { waccs, gs, z, perShare, centre: (n - 1) / 2 };
}

// Names the page imports (the standalone build cannot rename imports).
export const dcfValue = value;
export const dcfSensitivity = sensitivity;
export const dcfSurface = valueSurface;
