import test from 'node:test';
import assert from 'node:assert/strict';
import { valuationDefaults, projectUfcf, dcf, value, sensitivity, rating, valueSurface } from '../src/planner/valuation.js';
import { summarize } from '../src/planner/engine.js';

const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) < tol, `${a} vs ${b}`);

test('dcf matches a hand calculation', () => {
  // 100/1.1 + 110/1.21 = 181.818...; TV = 110 x 1.03 / 0.07; discounted two years.
  const r = dcf([100, 110], 0.1, 0.03);
  near(r.pvFcf, 100 / 1.1 + 110 / 1.21);
  near(r.tv, (110 * 1.03) / 0.07);
  near(r.ev, 100 / 1.1 + 110 / 1.21 + ((110 * 1.03) / 0.07) / 1.21);
});

test('cash flows growing at the terminal rate give the growing perpetuity FCF1 / (r - g), for any horizon', () => {
  for (const n of [1, 3, 5, 10]) {
    const f = Array.from({ length: n }, (_, i) => 100 * Math.pow(1.02, i));
    near(dcf(f, 0.1, 0.02).ev, 100 / (0.1 - 0.02), 1e-7);
  }
});

test('the discount rate must exceed terminal growth', () => {
  assert.match(dcf([100], 0.03, 0.03).error, /higher/);
  assert.match(value({ baseSales: 100, years: 5, growthStart: 0.05, growthTerminal: 0.05, ebitMargin: 0.2, taxRate: 0.25, daPct: 0.05, capexPct: 0.06, nwcPct: 0.1, wacc: 0.04 }, { cash: 0, debt: 0 }).error, /higher/);
});

test('one projected year follows the free cash flow identity', () => {
  const a = { baseSales: 1000, years: 1, growthStart: 0.1, growthTerminal: 0.1, ebitMargin: 0.2, taxRate: 0.25, daPct: 0.05, capexPct: 0.06, nwcPct: 0.1, wacc: 0.1, };
  const [y] = projectUfcf(a);
  near(y.sales, 1100);
  // NOPAT 165 + D&A 55 - capex 66 - change in NWC 10
  near(y.ufcf, 144);
});

test('growth fades in a straight line to the terminal rate', () => {
  const rows = projectUfcf({ baseSales: 100, years: 5, growthStart: 0.10, growthTerminal: 0.02, ebitMargin: 0.2, taxRate: 0.2, daPct: 0, capexPct: 0, nwcPct: 0 });
  near(rows[0].g, 0.10); near(rows[2].g, 0.06); near(rows[4].g, 0.02);
});

test('equity bridge, value per share, upside and rating', () => {
  const a = { baseSales: 1000, years: 5, growthStart: 0.05, growthTerminal: 0.025, ebitMargin: 0.2, taxRate: 0.25, daPct: 0.04, capexPct: 0.05, nwcPct: 0.1, wacc: 0.09 };
  const v = value(a, { cash: 300, debt: 500, shares: 100, price: 20 });
  near(v.netDebt, 200);
  near(v.equity, v.ev - 200);
  near(v.perShare, v.equity / 100);
  near(v.upside, v.perShare / 20 - 1);
  assert.equal(v.rating, rating(v.upside));
  assert.equal(rating(0.2), 'Buy'); assert.equal(rating(-0.2), 'Sell'); assert.equal(rating(0.05), 'Hold'); assert.equal(rating(null), null);
});

test('without shares the result is equity value, with no rating', () => {
  const a = { baseSales: 1000, years: 5, growthStart: 0.05, growthTerminal: 0.025, ebitMargin: 0.2, taxRate: 0.25, daPct: 0.04, capexPct: 0.05, nwcPct: 0.1, wacc: 0.09 };
  const v = value(a, { cash: 0, debt: 0 });
  assert.equal(v.perShare, null); assert.equal(v.rating, null);
});

test('sensitivity grid: centre equals the base case, value falls as the discount rate rises', () => {
  const a = { baseSales: 1000, years: 5, growthStart: 0.05, growthTerminal: 0.025, ebitMargin: 0.2, taxRate: 0.25, daPct: 0.04, capexPct: 0.05, nwcPct: 0.1, wacc: 0.09 };
  const b = { cash: 0, debt: 0, shares: 50, price: 10 };
  const s = sensitivity(a, b);
  near(s.cells[2][2], value(a, b).perShare);
  for (let j = 0; j < 5; j++) for (let i = 1; i < 5; i++) assert.ok(s.cells[i][j] < s.cells[i - 1][j]);
  for (let i = 0; i < 5; i++) for (let j = 1; j < 5; j++) assert.ok(s.cells[i][j] > s.cells[i][j - 1]);
});

test('defaults come from the latest year and flag a missing capex', () => {
  const y = { sales: 1250, cogs: 720, opex: 165, depreciation: 60, interest: 25, taxes: 56, dividends: 40, cash: 300, receivables: 250, inventory: 150, otherCurrentAssets: 100,
    netFixedAssets: 900, otherNonCurrentAssets: 300, payables: 200, otherCurrentLiabilities: 150, notesPayable: 50, longTermDebt: 500, otherLongTermLiabilities: 200, commonStock: 200, retainedEarnings: 800, otherEquity: -100 };
  const s = summarize(y);
  const withCf = valuationDefaults(s, { capex: 80 }, { taxRate: 0.2, growth: 0.1 });
  near(withCf.ebitMargin, 305 / 1250); near(withCf.capexPct, 80 / 1250); near(withCf.nwcPct, (250 + 150 + 100 - 200 - 150) / 1250);
  assert.equal(withCf.notes.length, 0); near(withCf.growthStart, 0.1);
  const noCf = valuationDefaults(s, null, {});
  near(noCf.capexPct, 60 / 1250); assert.match(noCf.notes[0], /not found/);
});

test('surface: centre is the base case, value falls with the discount rate and rises with growth, tight cells are blank', () => {
  const a = { baseSales: 1000, years: 5, growthStart: 0.05, growthTerminal: 0.025, ebitMargin: 0.2, taxRate: 0.25, daPct: 0.04, capexPct: 0.05, nwcPct: 0.1, wacc: 0.09 };
  const b = { cash: 0, debt: 0, shares: 50, price: 10 };
  const s = valueSurface(a, b, { n: 9 });
  near(s.z[4][4], value(a, b).perShare);
  for (let j = 0; j < 9; j++) for (let i = 1; i < 9; i++) if (s.z[i][j] !== null && s.z[i - 1][j] !== null) assert.ok(s.z[i][j] < s.z[i - 1][j]);
  for (let i = 0; i < 9; i++) for (let j = 1; j < 9; j++) if (s.z[i][j] !== null && s.z[i][j - 1] !== null) assert.ok(s.z[i][j] > s.z[i][j - 1]);
  const tight = valueSurface({ ...a, wacc: 0.04 }, b, { n: 9 });
  assert.equal(tight.z[0][8], null);              // wacc 1.5% against growth 4%: no valid price
  assert.ok(tight.z[8][0] !== null);              // wacc 6.5% against growth 1%: fine
  assert.ok(tight.z.flat().some((v) => v === null));
  const noShares = valueSurface(a, { cash: 0, debt: 0 }, { n: 5 });
  assert.equal(noShares.perShare, false); near(noShares.z[2][2], value(a, { cash: 0, debt: 0 }).equity);
});
